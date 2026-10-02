/**
 * js/gdrive.js - Google Drive Integration Module (Zero Backend, Pure Client-side GIS)
 * Provides cloud saving, loading, and texture asset management for GridMap Studio.
 */

const GoogleDriveManager = {
  // Constants
  FOLDER_NAME: 'GridMapStudio',
  TEXTURES_FOLDER_NAME: 'Textures',
  SCOPE: 'https://www.googleapis.com/auth/drive.file',
  STORAGE_KEY_CLIENT_ID: 'gridmap_custom_gdrive_client_id',
  
  // Default Production Client ID (set your production ID here)
  PRODUCTION_CLIENT_ID: 'YOUR_PRODUCTION_CLIENT_ID.apps.googleusercontent.com',

  // Runtime State
  accessToken: null,
  tokenExpiresAt: 0,
  tokenClient: null,
  appFolderId: null,
  texturesFolderId: null,
  currentUser: null, // { email, name, picture } if available
  isLoadingSdk: false,

  // Get active Client ID (Custom ID in LocalStorage takes precedence over Production ID)
  getClientId() {
    try {
      const customId = localStorage.getItem(this.STORAGE_KEY_CLIENT_ID);
      if (customId && customId.trim()) {
        return customId.trim();
      }
    } catch (e) {
      console.warn('LocalStorage access failed:', e);
    }

    const host = (typeof window !== 'undefined' && window.location) ? window.location.hostname : '';
    const isProduction = host === 'nira.poi.jp' || host === 'niratama.github.io';
    return isProduction ? this.PRODUCTION_CLIENT_ID : '';
  },

  // Save custom Client ID
  setCustomClientId(id) {
    if (id && id.trim()) {
      localStorage.setItem(this.STORAGE_KEY_CLIENT_ID, id.trim());
    } else {
      localStorage.removeItem(this.STORAGE_KEY_CLIENT_ID);
    }
    // Invalidate existing token client
    this.tokenClient = null;
    this.accessToken = null;
    this.tokenExpiresAt = 0;
  },

  // Check if configured
  isConfigured() {
    const id = this.getClientId();
    return !!(id && id !== 'YOUR_PRODUCTION_CLIENT_ID.apps.googleusercontent.com');
  },

  // Check if authenticated with valid token
  isAuthenticated() {
    return !!(this.accessToken && Date.now() < this.tokenExpiresAt);
  },

  // Dynamically load Google Identity Services SDK on demand (Zero dependency at startup)
  async loadSdk() {
    if (typeof window === 'undefined') return false;
    if (window.google?.accounts?.oauth2) return true;
    if (this.isLoadingSdk) {
      // Wait for ongoing load
      while (this.isLoadingSdk) {
        await new Promise(r => setTimeout(r, 100));
      }
      return !!window.google?.accounts?.oauth2;
    }

    this.isLoadingSdk = true;
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = (err) => reject(err);
        document.head.appendChild(script);
      });
      return true;
    } catch (err) {
      console.error('Failed to load Google Identity Services SDK:', err);
      return false;
    } finally {
      this.isLoadingSdk = false;
    }
  },

  // Authenticate user via Google Identity Services Token Client
  async authenticate(promptSelectAccount = false) {
    if (this.isAuthenticated()) {
      return this.accessToken;
    }

    const clientId = this.getClientId();
    if (!clientId || clientId.includes('YOUR_PRODUCTION_CLIENT_ID')) {
      throw new Error('CONFIG_REQUIRED');
    }

    const loaded = await this.loadSdk();
    if (!loaded) {
      throw new Error('SDK_LOAD_FAILED');
    }

    return new Promise((resolve, reject) => {
      try {
        this.tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: this.SCOPE,
          callback: (response) => {
            if (response.error) {
              reject(new Error(response.error_description || response.error));
              return;
            }
            this.accessToken = response.access_token;
            // Token is typically valid for 3600 seconds (1 hour); store expiration slightly early (55 min)
            const expiresIn = parseInt(response.expires_in, 10) || 3600;
            this.tokenExpiresAt = Date.now() + (expiresIn - 300) * 1000;
            
            // Fetch basic profile info
            this.fetchUserProfile().catch(console.warn);
            resolve(this.accessToken);
          },
          error_callback: (err) => {
            reject(err);
          }
        });

        // Request token (triggers Google login/consent popup)
        this.tokenClient.requestAccessToken({
          prompt: promptSelectAccount ? 'select_account' : ''
        });
      } catch (err) {
        reject(err);
      }
    });
  },

  // Sign out (revoke or clear cached token)
  signOut() {
    if (this.accessToken && window.google?.accounts?.oauth2?.revoke) {
      try {
        window.google.accounts.oauth2.revoke(this.accessToken, () => {});
      } catch (e) {
        console.warn('Revoke token error:', e);
      }
    }
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    this.currentUser = null;
    this.appFolderId = null;
    this.texturesFolderId = null;
  },

  // Fetch user profile info
  async fetchUserProfile() {
    if (!this.accessToken) return null;
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      });
      if (res.ok) {
        this.currentUser = await res.json();
        return this.currentUser;
      }
    } catch (e) {
      console.warn('Fetch user profile failed:', e);
    }
    return null;
  },

  // REST API request helper with auth header
  async apiRequest(endpoint, options = {}) {
    const token = await this.authenticate();
    const headers = {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    };

    const url = endpoint.startsWith('http') ? endpoint : `https://www.googleapis.com/drive/v3/${endpoint}`;
    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      // Token expired, clear and retry once
      this.accessToken = null;
      this.tokenExpiresAt = 0;
      const newToken = await this.authenticate();
      headers.Authorization = `Bearer ${newToken}`;
      const retryResponse = await fetch(url, { ...options, headers });
      if (!retryResponse.ok) {
        const err = await retryResponse.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${retryResponse.status}`);
      }
      return retryResponse;
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${response.status}`);
    }

    return response;
  },

  // Find or create dedicated app folder (GridMapStudio/) in user's root Drive
  async ensureAppFolder() {
    if (this.appFolderId) return this.appFolderId;

    // Search for existing folder
    const q = `mimeType='application/vnd.google-apps.folder' and name='${this.FOLDER_NAME}' and trashed=false and 'root' in parents`;
    const res = await this.apiRequest(`files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
    const data = await res.json();

    if (data.files && data.files.length > 0) {
      this.appFolderId = data.files[0].id;
      return this.appFolderId;
    }

    // Create new folder
    const createRes = await this.apiRequest('files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: this.FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder'
      })
    });
    const folder = await createRes.json();
    this.appFolderId = folder.id;
    return this.appFolderId;
  },

  // Find or create Textures subfolder (GridMapStudio/Textures/)
  async ensureTexturesFolder() {
    if (this.texturesFolderId) return this.texturesFolderId;
    const parentId = await this.ensureAppFolder();

    const q = `mimeType='application/vnd.google-apps.folder' and name='${this.TEXTURES_FOLDER_NAME}' and trashed=false and '${parentId}' in parents`;
    const res = await this.apiRequest(`files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
    const data = await res.json();

    if (data.files && data.files.length > 0) {
      this.texturesFolderId = data.files[0].id;
      return this.texturesFolderId;
    }

    const createRes = await this.apiRequest('files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: this.TEXTURES_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      })
    });
    const folder = await createRes.json();
    this.texturesFolderId = folder.id;
    return this.texturesFolderId;
  },

  // List all map JSON files in GridMapStudio/ folder
  async listMapFiles() {
    const folderId = await this.ensureAppFolder();
    const q = `'${folderId}' in parents and trashed=false and (mimeType='application/json' or name contains '.json')`;
    const fields = 'files(id,name,size,modifiedTime,createdTime,description)';
    const res = await this.apiRequest(`files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&orderBy=modifiedTime desc`);
    const data = await res.json();
    return data.files || [];
  },

  // Save map data to Google Drive (Supports Create New or Update Existing)
  async saveMap(fileName, mapDataObj, targetFileId = null) {
    const jsonStr = JSON.stringify(mapDataObj, null, 2);
    const folderId = await this.ensureAppFolder();

    // Ensure .json extension
    let cleanName = fileName.trim();
    if (!cleanName.endsWith('.json')) {
      cleanName += '.json';
    }

    if (targetFileId) {
      // 1. UPDATE EXISTING FILE (PATCH)
      const res = await this.apiRequest(
        `https://www.googleapis.com/upload/drive/v3/files/${targetFileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: jsonStr
        }
      );
      const updated = await res.json();

      // Update file name if changed
      await this.apiRequest(`files/${targetFileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName })
      });

      return { id: targetFileId, name: cleanName, modifiedTime: new Date().toISOString() };
    } else {
      // 2. CREATE NEW FILE (Multipart Upload: Metadata + Body)
      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const metadata = {
        name: cleanName,
        mimeType: 'application/json',
        parents: [folderId],
        description: 'Created with GridMap Studio'
      };

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        jsonStr +
        closeDelimiter;

      const res = await this.apiRequest(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/related; boundary=${boundary}`
          },
          body: multipartRequestBody
        }
      );
      return await res.json();
    }
  },

  // Download and parse map JSON file by File ID
  async loadMap(fileId) {
    const res = await this.apiRequest(`files/${fileId}?alt=media`);
    const json = await res.json();
    
    // Also fetch metadata for file name
    const metaRes = await this.apiRequest(`files/${fileId}?fields=id,name,modifiedTime`);
    const metadata = await metaRes.json();

    return {
      fileId,
      name: metadata.name,
      modifiedTime: metadata.modifiedTime,
      data: json
    };
  },

  // Delete a file in Google Drive (move to trash)
  async deleteFile(fileId) {
    await this.apiRequest(`files/${fileId}`, {
      method: 'DELETE'
    });
    return true;
  },

  // List texture image files in GridMapStudio/Textures/ folder
  async listTextureFiles() {
    const folderId = await this.ensureTexturesFolder();
    const q = `'${folderId}' in parents and trashed=false and mimeType contains 'image/'`;
    const fields = 'files(id,name,size,modifiedTime,thumbnailLink,webContentLink)';
    const res = await this.apiRequest(`files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&orderBy=name asc`);
    const data = await res.json();
    return data.files || [];
  },

  // Download texture image file and convert to Base64 DataURL
  async loadTextureAsDataUrl(fileId) {
    const res = await this.apiRequest(`files/${fileId}?alt=media`);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(blob);
    });
  },

  // Upload an image file to GridMapStudio/Textures/ folder
  async uploadTextureFile(fileName, fileBlob) {
    const folderId = await this.ensureTexturesFolder();
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: fileName,
      mimeType: fileBlob.type || 'image/png',
      parents: [folderId]
    };

    // Convert blob to base64 or arraybuffer for multipart
    const arrayBuffer = await fileBlob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Data = btoa(binary);

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${fileBlob.type || 'image/png'}\r\n` +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      base64Data +
      closeDelimiter;

    const res = await this.apiRequest(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartRequestBody
      }
    );
    return await res.json();
  }
};

// Global export for browser & tests
if (typeof window !== 'undefined') window.GoogleDriveManager = GoogleDriveManager;
if (typeof global !== 'undefined') global.GoogleDriveManager = GoogleDriveManager;
