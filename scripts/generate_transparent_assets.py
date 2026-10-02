#!/usr/bin/env python3
"""
generate_transparent_assets.py - Generate high-quality 32-bit RGBA PNG assets with true alpha transparency.
Zero external dependencies (uses standard zlib, math, struct).
"""

import math
import struct
import zlib

def write_png_rgba(filename, width, height, pixels):
    """
    pixels: list or bytearray of length width * height * 4 (R, G, B, A)
    """
    raw_rows = bytearray()
    row_bytes = width * 4
    for y in range(height):
        raw_rows.append(0)  # Filter type 0: None
        start = y * row_bytes
        raw_rows.extend(pixels[start:start + row_bytes])

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    header = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))  # 8-bit depth, color type 6 (RGBA)
    idat = chunk(b'IDAT', zlib.compress(bytes(raw_rows), 9))
    iend = chunk(b'IEND', b'')

    with open(filename, 'wb') as f:
        f.write(header + ihdr + idat + iend)
    print(f"Generated {filename} ({width}x{height}, {len(raw_rows)} raw bytes)")

def generate_magic_circle():
    width = 512
    height = 512
    cx = width / 2.0
    cy = height / 2.0
    max_radius = 240.0

    # RGBA buffer
    buf = bytearray(width * height * 4)

    def set_pixel(x, y, r, g, b, a):
        if 0 <= x < width and 0 <= y < height:
            idx = (y * width + x) * 4
            existing_a = buf[idx + 3] / 255.0
            new_a = a / 255.0
            out_a = new_a + existing_a * (1.0 - new_a)
            if out_a > 0:
                buf[idx] = int((r * new_a + buf[idx] * existing_a * (1.0 - new_a)) / out_a)
                buf[idx + 1] = int((g * new_a + buf[idx + 1] * existing_a * (1.0 - new_a)) / out_a)
                buf[idx + 2] = int((b * new_a + buf[idx + 2] * existing_a * (1.0 - new_a)) / out_a)
                buf[idx + 3] = int(out_a * 255)

    for py in range(height):
        for px in range(width):
            dx = px - cx
            dy = py - cy
            dist = math.hypot(dx, dy)
            angle = math.atan2(dy, dx)

            if dist > max_radius + 4:
                continue

            intensity = 0.0
            color = (56, 189, 248) # Cyan

            # Outer border rings
            def ring(r, thick=2.0):
                d = abs(dist - r)
                return max(0.0, 1.0 - d / thick)

            # Triple outer rings
            r1 = ring(max_radius, 2.5) * 1.0
            r2 = ring(max_radius - 8, 1.8) * 0.9
            r3 = ring(max_radius - 32, 2.0) * 0.95
            r4 = ring(max_radius - 40, 1.5) * 0.8
            r5 = ring(120, 2.0) * 0.9
            r6 = ring(70, 1.8) * 0.9
            r7 = ring(25, 2.5) * 1.0

            intensity = max(r1, r2, r3, r4, r5, r6, r7)

            # Runes on outer ring (between max_radius-32 and max_radius-8)
            if max_radius - 32 <= dist <= max_radius - 8:
                seg_angle = (angle + math.pi) % (math.pi / 12)
                rad_diff = dist - (max_radius - 20)
                # Hash marks
                if abs(seg_angle - (math.pi / 24)) < 0.02:
                    intensity = max(intensity, 0.85)
                # Dots
                if abs(rad_diff) < 3.0 and abs(seg_angle - (math.pi / 24)) < 0.08:
                    intensity = max(intensity, 0.9)

            # Hexagram / Star of David in middle ring (radius ~ 120)
            star_r = 120.0
            # Test distance to 2 triangles
            def dist_to_segment(x, y, x1, y1, x2, y2):
                l2 = (x2 - x1)**2 + (y2 - y1)**2
                if l2 == 0:
                    return math.hypot(x - x1, y - y1)
                t = max(0.0, min(1.0, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / l2))
                proj_x = x1 + t * (x2 - x1)
                proj_y = y1 + t * (y2 - y1)
                return math.hypot(x - proj_x, y - proj_y)

            for tri_offset in [0, math.pi]:
                for i in range(3):
                    a1 = tri_offset + i * (2 * math.pi / 3)
                    a2 = tri_offset + ((i + 1) % 3) * (2 * math.pi / 3)
                    x1 = cx + star_r * math.cos(a1)
                    y1 = cy + star_r * math.sin(a1)
                    x2 = cx + star_r * math.cos(a2)
                    y2 = cy + star_r * math.sin(a2)
                    d = dist_to_segment(px, py, x1, y1, x2, y2)
                    if d < 2.0:
                        intensity = max(intensity, 1.0 - d / 2.0)

            # Central 8-ray burst
            if 25 <= dist <= 70:
                mod_a = (angle + math.pi) % (math.pi / 4)
                if abs(mod_a - math.pi / 8) < 0.03:
                    intensity = max(intensity, 0.9)

            # Core glow
            if dist < 25:
                core_glow = (1.0 - dist / 25.0)**1.5
                intensity = max(intensity, core_glow * 0.7)

            # Subtle overall background aura inside circle
            if dist < max_radius:
                aura = (1.0 - dist / max_radius)**2 * 0.15
                intensity = max(intensity, aura)

            if intensity > 0.01:
                # Color gradient: Cyan outer, Violet / Magenta inner, White highlight
                alpha = min(1.0, intensity)
                # Outer to inner color shift
                t_color = dist / max_radius
                # Cyan (0, 240, 255) to Violet (192, 132, 252)
                red = int(192 * (1.0 - t_color) + 14 * t_color + 60 * intensity)
                green = int(132 * (1.0 - t_color) + 210 * t_color + 40 * intensity)
                blue = int(255 * (1.0 - t_color) + 255 * t_color)
                red = min(255, red)
                green = min(255, green)
                blue = min(255, blue)
                a_byte = int(alpha * 240)
                set_pixel(px, py, red, green, blue, a_byte)

    write_png_rgba('assets/textures/magic_circle_alpha.png', width, height, buf)

def generate_round_rug():
    """Generate an ornate circular decorative rug with transparent background."""
    width = 512
    height = 512
    cx = width / 2.0
    cy = height / 2.0
    max_radius = 240.0

    buf = bytearray(width * height * 4)

    def set_pixel(x, y, r, g, b, a):
        if 0 <= x < width and 0 <= y < height:
            idx = (y * width + x) * 4
            buf[idx] = r
            buf[idx + 1] = g
            buf[idx + 2] = b
            buf[idx + 3] = a

    for py in range(height):
        for px in range(width):
            dx = px - cx
            dy = py - cy
            dist = math.hypot(dx, dy)
            angle = math.atan2(dy, dx)

            if dist > max_radius:
                continue

            # Fringes at the edge
            if dist > max_radius - 8:
                fringe_density = math.sin(angle * 96)
                if fringe_density > -0.2:
                    set_pixel(px, py, 234, 179, 8, 230) # Gold fringe
                continue

            # Outer decorative border (Crimson & Gold)
            if dist > max_radius - 28:
                # Gold band
                if dist > max_radius - 14 or dist < max_radius - 24:
                    set_pixel(px, py, 202, 138, 4, 255)
                else:
                    # Intricate pattern
                    pat = math.sin(angle * 32)
                    if pat > 0:
                        set_pixel(px, py, 136, 19, 55, 255) # Deep crimson
                    else:
                        set_pixel(px, py, 245, 158, 11, 255) # Gold
                continue

            # Inner field (Navy Blue & Floral Medallion)
            if dist > 80:
                # Navy background with concentric floral rosettes
                petal = math.sin(angle * 16 + dist * 0.1)
                if petal > 0.5:
                    set_pixel(px, py, 190, 24, 93, 255) # Rose/Crimson
                elif petal < -0.5:
                    set_pixel(px, py, 217, 119, 6, 255) # Amber
                else:
                    set_pixel(px, py, 30, 41, 59, 255) # Navy Slate
                continue

            # Center Medallion
            if dist > 30:
                flower = math.sin(angle * 8)
                if flower > 0:
                    set_pixel(px, py, 234, 179, 8, 255) # Gold
                else:
                    set_pixel(px, py, 159, 18, 57, 255) # Crimson
                continue

            # Core
            set_pixel(px, py, 254, 240, 138, 255) # Light gold

    write_png_rgba('assets/textures/round_rug_alpha.png', width, height, buf)

if __name__ == '__main__':
    generate_magic_circle()
    generate_round_rug()
