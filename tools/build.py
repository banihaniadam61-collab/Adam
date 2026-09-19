#!/usr/bin/env python3
"""Build the exam data files from the question banks.

Each questions/<name>.json holds one section's full question list in page
order. This chunks it into page ranges (range_size pages each) and splits
every range into exams of at most exam_size questions, adding a part number
when a range overflows one exam.
"""
import glob
import io
import json
import os

ORD = [u"الْأَوَّلُ", u"الثَّانِي", u"الثَّالِثُ", u"الرَّابِعُ", u"الْخَامِسُ",
       u"السَّادِسُ", u"السَّابِعُ", u"الثَّامِنُ", u"التَّاسِعُ", u"الْعَاشِرُ",
       u"الْحَادِيَ عَشَرَ", u"الثَّانِيَ عَشَرَ", u"الثَّالِثَ عَشَرَ",
       u"الرَّابِعَ عَشَرَ", u"الْخَامِسَ عَشَرَ"]
DIG = u"٠١٢٣٤٥٦٧٨٩"


def ar(n):
    return u''.join(DIG[int(c)] for c in str(n))


def build(path):
    sec = json.load(io.open(path, encoding='utf-8'))
    size = sec.get('range_size', 20)
    per = sec.get('exam_size', 15)
    qs = sorted(sec['questions'], key=lambda q: q.get('page', 0))

    # Group questions into fixed page windows (20-40, 40-60, ...).
    buckets = {}
    for q in qs:
        lo = (q.get('page', 0) // size) * size
        buckets.setdefault(lo, []).append(q)

    last_page = max(q.get('page', 0) for q in qs)
    exams = []
    for lo in sorted(buckets):
        group = buckets[lo]
        # Don't advertise a window past where the section actually ends.
        hi = min(lo + size, last_page) if sec.get('complete') else lo + size
        span = u"%s–%s" % (ar(lo), ar(hi))
        parts = [group[i:i + per] for i in range(0, len(group), per)]
        for i, part in enumerate(parts):
            title = u"الْعَقِيدَةُ" if sec['id'] == 'creed' else sec['title']
            name = u"%s — صَفَحَاتُ %s" % (title, span)
            if len(parts) > 1:
                name += u" (الْجُزْءُ %s)" % ORD[i]
            exams.append({"id": "%s-%03d-%03d-p%d" % (sec['id'], lo, lo + size, i + 1),
                          "kind": "range", "title": name, "pages": span,
                          "questions": part})

    out = {"id": sec['id'], "title": sec['title'], "pages": sec['pages'],
           "exams": exams}
    # Comprehensive exams draw from the whole section, so they are only
    # generated once every page of that section has been read in.
    if sec.get('complete'):
        out['mixed'] = {"size": per}
    js = (u"/* مولّد آليًّا من questions/%s — لا يُحرّر باليد. */\n"
          u"window.EXAM_DATA.sections.push(\n%s\n);\n"
          % (os.path.basename(path), json.dumps(out, ensure_ascii=False, indent=1)))
    dest = 'data/%s.js' % sec.get('file', '10-' + sec['id'])
    io.open(dest, 'w', encoding='utf-8').write(js)
    print('%-28s %3d questions -> %2d exams -> %s'
          % (os.path.basename(path), len(qs), len(exams), dest))


if __name__ == '__main__':
    for p in sorted(glob.glob('questions/*.json')):
        build(p)
