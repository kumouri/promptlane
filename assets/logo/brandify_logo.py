"""Snap a generated logo's hues onto Ceryce's brand palette, keeping the shading.

Every pixel that reads as purple-ish is remapped onto Kumouri Purple #8e00ff and every green-ish
pixel onto Toxic Green #00ff0f, preserving its own lightness so outlines, highlights and shadows
survive. Whites, blacks and greys are left alone.

    python brandify_logo.py in.png out.png
"""
import colorsys
import sys

from PIL import Image

PURPLE = (0x8E, 0x00, 0xFF)
GREEN = (0x00, 0xFF, 0x0F)


def hue_of(rgb):
    return colorsys.rgb_to_hls(*(c / 255 for c in rgb))[0]


H_PURPLE, H_GREEN = hue_of(PURPLE), hue_of(GREEN)


def snap(px):
    r, g, b, a = px
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    if s < 0.12 or l < 0.06 or l > 0.97:
        return px  # neutral: outlines, whites, background
    # purple family: hue 0.62..0.85 ; green family: 0.22..0.48
    if 0.60 <= h <= 0.86:
        target_h, boost = H_PURPLE, min(1.0, s * 1.6)
    elif 0.20 <= h <= 0.50:
        target_h, boost = H_GREEN, min(1.0, s * 1.6)
    else:
        return px
    nr, ng, nb = colorsys.hls_to_rgb(target_h, l, boost)
    return (int(nr * 255), int(ng * 255), int(nb * 255), a)


def main(src, dst):
    im = Image.open(src).convert("RGBA")
    im.putdata([snap(p) for p in im.getdata()])
    im.save(dst)
    print("wrote", dst, im.size)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
