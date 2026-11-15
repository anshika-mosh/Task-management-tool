import { describe, expect, it } from "vitest";
import { drivePreview, driveThumb, parseLink } from "@/lib/links";

describe("parseLink", () => {
  it("recognises a Google Drive file link and extracts the id", () => {
    const p = parseLink("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz12345/view?usp=sharing")!;
    expect(p.type).toBe("drive");
    expect(p.driveId).toBe("1AbCdEfGhIjKlMnOpQrStUvWxYz12345");
    expect(p.defaultName).toBe("Drive file");
  });

  it("handles multi-account Drive links (/u/1/)", () => {
    expect(parseLink("https://drive.google.com/file/u/1/d/1AbCdEfGhIjKlMnOp/view")?.driveId).toBe("1AbCdEfGhIjKlMnOp");
  });

  it.each([
    ["open?id=", "https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrSt"],
    ["uc?id=", "https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOpQrSt"],
  ])("extracts the id from %s links", (_n, url) => {
    const p = parseLink(url)!;
    expect(p.type).toBe("drive");
    expect(p.driveId).toBe("1AbCdEfGhIjKlMnOpQrSt");
  });

  it("treats Google Docs files as Drive files", () => {
    expect(parseLink("https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrSt/edit")?.type).toBe("drive");
  });

  it("treats a Drive folder as a plain web link (it cannot be embedded)", () => {
    const p = parseLink("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrSt")!;
    expect(p.type).toBe("web");
    expect(p.driveId).toBeNull();
    expect(p.defaultName).toBe("Drive folder");
  });

  it.each(["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"])("detects direct .%s image URLs", (ext) => {
    const p = parseLink(`https://cdn.example.com/a/b/shot.${ext}?v=2`)!;
    expect(p.type).toBe("image");
    expect(p.defaultName).toBe(`shot.${ext}`);
  });

  it.each(["mp4", "webm", "mov"])("detects direct .%s video URLs", (ext) => {
    expect(parseLink(`https://cdn.example.com/clip.${ext}`)?.type).toBe("video");
  });

  it("falls back to a generic web link named after the host", () => {
    const p = parseLink("https://www.loom.com/share/abc123")!;
    expect(p.type).toBe("web");
    expect(p.defaultName).toBe("www.loom.com");
  });

  it("trims surrounding whitespace", () => {
    expect(parseLink("  https://example.com/x  ")?.url).toBe("https://example.com/x");
  });

  it.each(["", "not a url", "javascript:alert(1)", "data:text/html,<script>1</script>", "ftp://example.com/file", "file:///etc/passwd"])(
    "rejects non-http(s) input: %j",
    (bad) => {
      expect(parseLink(bad)).toBeNull();
    },
  );
});

describe("drive url builders", () => {
  it("builds thumbnail and preview urls and encodes the id", () => {
    expect(driveThumb("abc", 200)).toBe("https://drive.google.com/thumbnail?id=abc&sz=w200");
    expect(drivePreview("abc")).toBe("https://drive.google.com/file/d/abc/preview");
    expect(drivePreview("a/b")).toContain("a%2Fb");
  });
});
