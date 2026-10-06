import type { FontResolver, LoadedFont, PathCommand } from "@/lib/document/fonts";

/** Fuente falsa y exacta para probar el motor sin Gotham: cada carácter avanza 600/1000 em y es un cuadrado. */
export class FakeFont implements LoadedFont {
  unitsPerEm = 1000;
  capHeight = 700;
  ascent = 900;
  descent = -200;
  constructor(private readonly advancePerChar = 600) {}

  hasGlyph(codePoint: number): boolean {
    return codePoint < 0x3000;
  }

  shape(text: string) {
    return [...text].map((char) => ({
      advance: this.advancePerChar,
      xOffset: 0,
      yOffset: 0,
      outline: (): PathCommand[] =>
        char === " "
          ? []
          : [
              { type: "M", x: 50, y: 0 },
              { type: "L", x: 550, y: 0 },
              { type: "L", x: 550, y: 700 },
              { type: "L", x: 50, y: 700 },
              { type: "Z" },
            ],
    }));
  }
}

export const fakeFonts: FontResolver = () => new FakeFont();
