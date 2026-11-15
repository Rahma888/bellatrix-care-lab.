# js/books: the novels of the Book reading activity

15 public-domain novels in their original language, 5 per language. 2 per language are free; the others are Books Premium (`free: false`).
All authors died before 1956, so the texts are in the public domain in the EU. Text cleaned for Bellatrix on 10 Nov 2026.

| id | Novel | Free | Chapters | Source (Project Gutenberg ebook) |
|---|---|---|---|---|
| fr-verne-tour-du-monde | Jules Verne, *Le Tour du monde en quatre-vingts jours* (1872) | yes | 37 | 800 |
| fr-sand-petite-fadette | George Sand, *La Petite Fadette* (1849) | yes | 41 (Notice + 40) | 34204 |
| fr-dumas-trois-mousquetaires | Alexandre Dumas, *Les Trois Mousquetaires* (1844) | | 69 (Préface + 67 + Épilogue) | 13951 |
| fr-alain-fournier-grand-meaulnes | Alain-Fournier, *Le Grand Meaulnes* (1913) | | 46 (3 parts + Épilogue) | 5781 |
| fr-colette-maison-de-claudine | Colette, *La Maison de Claudine* (1922) | | 30 | 13703 |
| de-spyri-heidi | Johanna Spyri, *Heidis Lehr- und Wanderjahre* (1880) | yes | 14 | 7500 |
| de-storm-immensee | Theodor Storm, *Immensee* (1849) | yes | 10 | 6651 |
| de-fontane-frau-jenny-treibel | Theodor Fontane, *Frau Jenny Treibel* (1892) | | 16 | 46184 |
| de-keller-kleider-machen-leute | Gottfried Keller, *Kleider machen Leute* (1874) | | 1 (novella) | 28042 (*Die Leute von Seldwyla*, vol. 2, first story only) |
| de-mann-koenigliche-hoheit | Thomas Mann, *Königliche Hoheit* (1909) | | 10 | 35328 |
| en-austen-pride-and-prejudice | Jane Austen, *Pride and Prejudice* (1813) | yes | 61 | 1342 |
| en-gaskell-cranford | Elizabeth Gaskell, *Cranford* (1853) | yes | 16 | 394 |
| en-montgomery-anne-of-green-gables | L. M. Montgomery, *Anne of Green Gables* (1908) | | 38 | 45 |
| en-doyle-adventures-of-sherlock-holmes | Arthur Conan Doyle, *The Adventures of Sherlock Holmes* (1892) | | 12 (one per story) | 1661 |
| en-jerome-three-men-in-a-boat | Jerome K. Jerome, *Three Men in a Boat* (1889) | | 20 (Preface + 19) | 308 |

Source URL of each book: `https://www.gutenberg.org/ebooks/<number>` (plain text UTF-8). The source's trademark name and licence text are removed from the book files, which its licence allows for public-domain texts.

## Files

- `index.js`: `BellatrixBooks.index([...])`, metadata only (id, lang, title, author, year, free, chapters, words, source, licence), in the order above. Always loaded.
- `<id>.js`: one comment line, then `BellatrixBooks.add({id, lang, title, author, year, free, source, licence, chapters: [{title, paras: [...]}]});`. Loaded only when the book opens. The object is written as JSON (UTF-8, not ASCII-escaped) with U+2028 and U+2029 escaped, so it is valid ES5.
- `sample-*.js`: test files of the reader (agent H), never offered and not in the index.

## Cleaning rules

- Only the text between the source's START and END lines; no producer or transcriber notes, tables of contents, lists of illustrations, title pages, printer's colophons or lists of corrections.
- No `[Illustration…]`, `[Picture…]`, `[Fußnote…]`, footnote marks or footnote blocks, page marks `{123}`, `_underscore_`, `=gesperrt=` or `#Antiqua#` marks.
- Hard-wrapped lines joined into paragraphs; verse and song lines kept one per paragraph. Spelling, punctuation and quotes as in the source; only `--` became `—`, scene breaks became `* * *`, Fontane's `>…<` became `›…‹`, and the small capitals at chapter starts of the English editions (`IN the first place`) became normal case.
- One chapter per chapter of the book, with its own title (all-capital titles put in normal case). Stories of a collection (Sherlock Holmes) are one chapter each. Long chapters stay whole; the reader paginates them.
- No HTML in paragraphs.

## Adding a book

1. Take a public-domain text in its original language (Project Gutenberg plain text, or fr/de.wikisource), and check title, author and language.
2. Clean it with the rules above and write `js/books/<lang>-<author>-<title>.js` (lower-case ASCII id) in the format above, under 2 MB.
3. Add its entry to `index.js` (chapter and word counts from the file), keep 2 free books per language, and update `EXPECTED` / `FREE` in `tests/books.test.mjs`.
4. Run `node tests/books.test.mjs`.
