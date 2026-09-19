#!/usr/bin/env python3
"""Render pages of the scanned book to PNGs for reading.

The scans carry no text layer, so every page has to be read visually.
Usage: render.py <pdf> <outdir> <first> <last> [scale]
"""
import sys, os
import pymupdf


def main():
    pdf, outdir, first, last = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    scale = float(sys.argv[5]) if len(sys.argv) > 5 else 2.6
    os.makedirs(outdir, exist_ok=True)
    doc = pymupdf.open(pdf)
    last = min(last, doc.page_count)
    for n in range(first, last + 1):
        page = doc[n - 1]
        pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale))
        path = os.path.join(outdir, 'p%03d.png' % n)
        pix.save(path)
        print(path, pix.width, 'x', pix.height)


if __name__ == '__main__':
    main()
