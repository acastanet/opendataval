import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

interface Actif { data: Buffer; gzip: Buffer; contentType: string; nom: string }

export class ActifsStatiques {
  private js?: Actif;
  private css?: Actif;
  private glyphe?: Buffer;
  private version?: string;

  constructor(private readonly assetsRoot: string) {}

  async initialiser(): Promise<void> {
    try {
      const manifest = JSON.parse(await readFile(join(this.assetsRoot, "vendor", "manifest.json"), "utf8")) as { version: string; js: string; css: string };
      const [js, css] = await Promise.all([
        readFile(join(this.assetsRoot, "vendor", manifest.js)),
        readFile(join(this.assetsRoot, "vendor", manifest.css)),
      ]);
      this.version = manifest.version;
      this.js = { data: js, gzip: gzipSync(js), contentType: "text/javascript; charset=utf-8", nom: manifest.js };
      this.css = { data: css, gzip: gzipSync(css), contentType: "text/css; charset=utf-8", nom: manifest.css };
    } catch {
      this.js = undefined;
      this.css = undefined;
      this.version = undefined;
    }

    try {
      this.glyphe = await readFile(join(this.assetsRoot, "glyphs", "Noto Sans Regular", "0-255.pbf"));
    } catch {
      this.glyphe = undefined;
    }
  }

  vendorStatus(): "disponible" | "indisponible" { return this.js && this.css ? "disponible" : "indisponible"; }
  glyphStatus(): "disponible" | "indisponible" { return this.glyphe ? "disponible" : "indisponible"; }
  vendorVersion(): string | undefined { return this.version; }

  vendor(type: "js" | "css"): Actif | undefined { return type === "js" ? this.js : this.css; }

  glyphe(fontstack: string, range: string): Buffer | undefined {
    if (fontstack === "Noto Sans Regular" && range === "0-255") return this.glyphe;
    return Buffer.alloc(0);
  }
}
