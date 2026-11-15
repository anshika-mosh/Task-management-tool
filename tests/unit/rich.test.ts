import { describe, expect, it } from "vitest";
import { isEmptyRich, looksLikeHtml, normalizeRich, plainToHtml, richToText, sanitizeRich, toSafeHtml, MAX_RICH_LENGTH } from "@/lib/rich";

describe("sanitizeRich keeps the formatting the editor produces", () => {
  it.each([
    ["bold / italic / underline / strike / highlight", "<p><strong>b</strong> <em>i</em> <u>u</u> <s>s</s> <mark>m</mark></p>"],
    ["headings", "<h1>One</h1><h2>Two</h2><h3>Three</h3>"],
    ["bullet list", "<ul><li><p>a</p></li><li><p>b</p></li></ul>"],
    ["numbered list", "<ol><li><p>a</p></li><li><p>b</p></li></ol>"],
    ["quote", "<blockquote><p>wise words</p></blockquote>"],
    ["inline code", "<p>use <code>npm test</code></p>"],
    ["code block", '<pre><code class="language-ts">const a = 1;</code></pre>'],
    ["divider", "<p>a</p><hr /><p>b</p>"],
    ["table", "<table><tbody><tr><th colspan=\"1\" rowspan=\"1\"><p>h</p></th></tr><tr><td colspan=\"1\" rowspan=\"1\"><p>c</p></td></tr></tbody></table>"],
    ["text alignment", '<p style="text-align:center">centred</p>'],
    ["subscript / superscript", "<p>H<sub>2</sub>O x<sup>2</sup></p>"],
  ])("%s", (_name, html) => {
    expect(sanitizeRich(html)).toBe(html);
  });

  it("keeps task lists (checklists) as disabled checkboxes", () => {
    const out = sanitizeRich('<ul data-type="taskList"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"><span></span></label><div><p>done</p></div></li></ul>');
    expect(out).toContain('data-type="taskList"');
    expect(out).toContain('data-checked="true"');
    expect(out).toMatch(/<input[^>]*type="checkbox"/);
    expect(out).toMatch(/<input[^>]*disabled/);
    expect(out).toMatch(/<input[^>]*checked/);
  });

  it("keeps media links (Drive) with their data attributes, and forces safe link attributes", () => {
    const out = sanitizeRich('<p><a href="https://drive.google.com/file/d/ABC/view" class="media-link" data-drive-id="ABC" data-media="drive">Mockup.png</a></p>');
    expect(out).toContain('data-drive-id="ABC"');
    expect(out).toContain('data-media="drive"');
    expect(out).toContain('class="media-link"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
  });

  it("keeps https images", () => {
    expect(sanitizeRich('<img src="https://cdn.test/a.png" alt="shot">')).toBe('<img src="https://cdn.test/a.png" alt="shot" />');
  });
});

describe("sanitizeRich blocks everything dangerous", () => {
  it.each([
    ["script tags (and their content)", "<p>hi</p><script>alert(1)</script>", "alert"],
    ["inline event handlers", '<p onclick="steal()">x</p>', "onclick"],
    ["javascript: links", '<a href="javascript:alert(1)">x</a>', "javascript"],
    ["data: links", '<a href="data:text/html,<script>1</script>">x</a>', "data:"],
    ["iframes", '<iframe src="https://evil.test"></iframe>', "iframe"],
    ["object / embed", '<object data="x"></object><embed src="x">', "embed"],
    ["style tags", "<style>body{display:none}</style><p>x</p>", "display:none"],
    ["forms", '<form action="https://evil.test"><input name="pw"></form>', "<form"],
    ["svg payloads", '<svg onload="alert(1)"><script>alert(1)</script></svg>', "svg"],
    ["img onerror", '<img src="https://x.test/a.png" onerror="alert(1)">', "onerror"],
    ["javascript: image src", '<img src="javascript:alert(1)">', "javascript"],
    ["data: image src", '<img src="data:image/png;base64,AAAA">', "data:"],
    ["style attributes with url()", '<p style="background:url(https://evil.test/x)">x</p>', "evil.test"],
    ["position:fixed overlays", '<p style="position:fixed;top:0">x</p>', "position"],
  ])("%s", (_name, html, forbidden) => {
    expect(sanitizeRich(html).toLowerCase()).not.toContain(forbidden.toLowerCase());
  });

  it("drops an <img> that has no safe src", () => {
    expect(sanitizeRich('<p>a</p><img src="javascript:alert(1)">')).toBe("<p>a</p>");
  });

  it("cannot be bypassed with odd casing, whitespace or entities", () => {
    for (const evil of ['<ScRiPt>alert(1)</sCrIpT>', '<a href="jav&#x61;script:alert(1)">x</a>', '<a href=" javascript:alert(1)">x</a>', '<img src=x onerror=alert(1)>']) {
      const out = sanitizeRich(evil).toLowerCase();
      expect(out).not.toMatch(/<script/);
      expect(out).not.toMatch(/javascript:/);
      expect(out).not.toMatch(/onerror/);
    }
  });

  it("limits the size of what it processes", () => {
    expect(sanitizeRich("<p>" + "x".repeat(MAX_RICH_LENGTH * 2) + "</p>").length).toBeLessThanOrEqual(MAX_RICH_LENGTH + 20);
  });
});

describe("plain text compatibility", () => {
  it("detects html vs plain text", () => {
    expect(looksLikeHtml("<p>x</p>")).toBe(true);
    expect(looksLikeHtml("hello <b>x</b>")).toBe(true);
    expect(looksLikeHtml("just words")).toBe(false);
    expect(looksLikeHtml("1 < 2 and 3 > 2")).toBe(false);
    expect(looksLikeHtml("a<b")).toBe(false);
  });

  it("plainToHtml escapes and keeps paragraphs and line breaks", () => {
    expect(plainToHtml("one\ntwo\n\nthree & <four>")).toBe("<p>one<br>two</p><p>three &amp; &lt;four&gt;</p>");
    expect(plainToHtml("")).toBe("");
  });

  it("toSafeHtml renders old plain-text content as safe paragraphs and sanitizes HTML", () => {
    expect(toSafeHtml("Fix <3 & more")).toBe("<p>Fix &lt;3 &amp; more</p>");
    expect(toSafeHtml("<p>ok</p><script>x</script>")).toBe("<p>ok</p>");
    expect(toSafeHtml(null)).toBe("");
    expect(toSafeHtml(undefined)).toBe("");
  });
});

describe("richToText / isEmptyRich / normalizeRich", () => {
  it("turns rich content into readable text with line breaks and decoded entities", () => {
    expect(richToText("<h1>Title</h1><p>one &amp; two</p><ul><li><p>a</p></li><li><p>b</p></li></ul>")).toBe("Title\none & two\na\nb");
    expect(richToText("<p>a<br>b</p>")).toBe("a\nb");
    expect(richToText("<p>5 &lt; 6</p>")).toBe("5 < 6");
  });
  it("leaves plain text alone", () => {
    expect(richToText("  plain text  ")).toBe("plain text");
    expect(richToText(null)).toBe("");
  });

  it("detects empty content from the editor", () => {
    for (const empty of ["", "   ", "<p></p>", "<p> </p>", "<p><br></p>", "<h1></h1><p></p>", null, undefined]) expect(isEmptyRich(empty)).toBe(true);
    for (const full of ["x", "<p>x</p>", '<p><img src="https://x.test/a.png"></p>', "<hr>", "<table><tr><td></td></tr></table>"]) expect(isEmptyRich(full)).toBe(false);
  });

  it("normalizeRich: plain text stays plain, HTML is sanitized, empty becomes ''", () => {
    expect(normalizeRich("  Looks good  ")).toBe("Looks good");
    expect(normalizeRich("<p>hi</p><script>x</script>")).toBe("<p>hi</p>");
    expect(normalizeRich("<p></p>")).toBe("");
    expect(normalizeRich("   ")).toBe("");
    expect(normalizeRich(null)).toBe("");
  });

  it("trims blank paragraphs the editor leaves at the start and end, but keeps ones in the middle", () => {
    expect(normalizeRich("<p></p><p>a</p><p><br></p><p>b</p><p></p><p> </p>")).toBe("<p>a</p><p><br /></p><p>b</p>");
    expect(normalizeRich("<ul><li><p>x</p></li></ul><p></p>")).toBe("<ul><li><p>x</p></li></ul>");
  });
});
