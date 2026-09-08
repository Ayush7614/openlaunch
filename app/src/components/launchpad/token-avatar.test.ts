import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { cn } from "../../lib/utils.ts";
import { tokenHue, tokenIdentity } from "../../lib/launchpad/token-identity.ts";

type AvatarProps = { token: string; symbol: string; chain?: string; image?: string | null; size?: number; className?: string };
type Element = { type: string; props: Record<string, unknown>; key?: string };

const source = readFileSync(new URL("./TokenAvatar.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const address = "0x49a5000000000000000000000000000000008576";
const props: AvatarProps = { token: address, symbol: "TOKEN" };
const jsx = (type: string, properties: Element["props"], key?: string): Element => ({ type, props: properties, key });

// Evaluate the actual component with its real identity and class merge helpers.
// Each harness is one mounted avatar, retaining its failed-image state on rerender.
function harness() {
  let failedSrc: string | null = null;
  const imports: Record<string, unknown> = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useState: () => [failedSrc, (next: string | null) => { failedSrc = next; }] },
    "@/lib/utils": { cn },
    "@/lib/launchpad/token-identity": { tokenHue, tokenIdentity },
    "./TokenAvatar.module.css": { default: { mosaic: "token-mosaic", drawing: "token-drawing", primary: "token-primary", secondary: "token-secondary" } },
  };
  const exported = {} as { default: (input: AvatarProps) => Element; hueOf: typeof tokenHue };
  runInNewContext(compiled, {
    exports: exported,
    require: (id: string) => {
      assert.ok(Object.hasOwn(imports, id), `Unexpected production import: ${id}`);
      return imports[id];
    },
    fetch: () => assert.fail("Generated token identities must not request an avatar service"),
  });
  return { render: exported.default, hueOf: exported.hueOf };
}

function descendants(element: Element): Element[] {
  const found: Element[] = [];
  function visit(child: unknown) {
    if (Array.isArray(child)) child.forEach(visit);
    else if (child && typeof child === "object" && "type" in child && "props" in child) {
      const node = child as Element;
      found.push(node);
      visit(node.props.children);
    }
  }
  visit(element.props.children);
  return found;
}

function geometry(avatar: Element) {
  return descendants(avatar).filter(({ type }) => type === "g" || type === "path").map(({ type, props: properties }) => ({
    type, transform: properties.transform, path: properties.d, tone: properties.className,
  }));
}

test("generated token icons preserve identity across chains, symbols, sizes, and casing", () => {
  const { render, hueOf } = harness();
  const expected = geometry(render(props));
  assert.equal(hueOf(address), tokenHue(address));
  for (const size of [20, 28, 36, 56]) {
    for (const context of [{ chain: "base", symbol: "ORIGINAL" }, { chain: "robinhood", symbol: "RENAMED" }]) {
      const avatar = render({ ...props, ...context, token: ` ${address.toUpperCase()} `, size });
      assert.equal(avatar.props["data-token-avatar"], "generated");
      assert.deepEqual(geometry(avatar), expected);
      const style = avatar.props.style as Record<string, unknown>;
      assert.equal(style.width, size);
      assert.equal(style.height, size);
      assert.equal(style["--token-hue"], tokenIdentity(address).primaryHue);
      assert.equal(style["--token-accent-hue"], tokenIdentity(address).secondaryHue);
      assert.equal(style["--token-bg-hue"], tokenIdentity(address).backgroundHue.light);
      assert.equal(style["--token-bg-dark-hue"], tokenIdentity(address).backgroundHue.dark);
      assert.deepEqual(tokenIdentity(` ${address.toUpperCase()} `).backgroundHue, tokenIdentity(address).backgroundHue);
      assert.match(String(avatar.props.className), size < 32 ? /rounded-md/ : /rounded-xl/);
    }
  }
  assert.equal((render(props).props.style as Record<string, unknown>).width, 40);
  assert.notDeepEqual(geometry(render({ ...props, token: "0x49a5000000000000000100000000000000008576" })), expected);
});

test("uploaded images take priority, trim whitespace, and fall back only for their failed source", () => {
  const { render } = harness();
  const first = "https://example.test/token-one.png";
  const second = "https://example.test/token-two.png";
  const image = render({ ...props, image: ` ${first} `, size: 56 });
  assert.equal(image.type, "img");
  assert.equal(image.props.src, first);
  assert.equal(image.key, first);
  assert.equal(image.props.width, 56);
  assert.equal(image.props.height, 56);
  assert.equal(image.props.alt, "");
  assert.equal(image.props.referrerPolicy, "no-referrer");
  (image.props.onError as () => void)();
  assert.equal(render({ ...props, image: first }).props["data-token-avatar"], "generated");
  const recovered = render({ ...props, image: second });
  assert.equal(recovered.type, "img");
  assert.equal(recovered.props.src, second);
  assert.equal(recovered.key, second);
  (recovered.props.onError as () => void)();
  assert.equal(render({ ...props, image: second }).props["data-token-avatar"], "generated");
  assert.equal(render({ ...props, image: first }).type, "img", "a different source gets its own load attempt");
  for (const image of [undefined, null, "", " \n\t "]) {
    assert.equal(render({ ...props, image }).props["data-token-avatar"], "generated");
  }
});

test("caller class overrides win for uploaded and generated token icons", () => {
  const { render } = harness();
  for (const image of [null, "https://example.test/logo.png"]) {
    const avatar = render({ ...props, image, size: 20, className: "rounded-full shrink object-contain custom-avatar" });
    const classes = String(avatar.props.className).split(/\s+/);
    for (const className of ["rounded-full", "shrink", "object-contain", "custom-avatar"]) assert.ok(classes.includes(className));
    for (const className of ["rounded-md", "rounded-xl", "shrink-0", "object-cover"]) assert.ok(!classes.includes(className));
  }
});

test("generated token icons stay decorative, unfocusable, and locally deterministic", () => {
  const avatar = harness().render(props);
  assert.equal(avatar.props["aria-hidden"], "true");
  assert.equal(avatar.props.tabIndex, undefined);
  const nodes = descendants(avatar);
  const svg = nodes.find(({ type }) => type === "svg");
  assert.ok(svg);
  assert.equal(svg.props.viewBox, "0 0 48 48");
  assert.equal(svg.props["aria-hidden"], "true");
  assert.equal(svg.props.focusable, "false");
  assert.ok(nodes.every(({ type }) => ["svg", "g", "path"].includes(type)));
  assert.equal(nodes.filter(({ type }) => type === "path").length, 9);
  for (const implementation of [source, readFileSync(new URL("../../lib/launchpad/token-identity.ts", import.meta.url), "utf8")]) {
    assert.doesNotMatch(implementation, /\b(?:fetch|XMLHttpRequest|WebSocket|Image)\s*\(|https?:\/\/|Math\.random|crypto\.|Date\.|new Date|dangerouslySetInnerHTML/);
  }
});

test("both actual CSS token tones maintain 4.5:1 contrast for every light and dark palette", () => {
  const css = readFileSync(new URL("./TokenAvatar.module.css", import.meta.url), "utf8");
  type Color = { variable: string; saturation: number; lightness: number };
  const colors = (selector: string, property: string): Color[] => Array.from(
    css.matchAll(new RegExp(`\\.${selector}\\s*\\{[^}]*?\\b${property}:\\s*hsl\\(var\\((--token-(?:(?:accent|bg|bg-dark)-)?hue)\\)\\s+([\\d.]+)%\\s+([\\d.]+)%\\)`, "g")),
    (match) => ({ variable: match[1], saturation: Number(match[2]), lightness: Number(match[3]) }),
  );
  const backgrounds = colors("mosaic", "background");
  const primary = colors("primary", "fill");
  const secondary = colors("secondary", "fill");
  for (const [selector, values] of [["mosaic", backgrounds], ["primary", primary], ["secondary", secondary]] as const) {
    assert.equal(values.length, 2, `read both actual ${selector} themes`);
    assert.match(css, new RegExp(`:global\\(\\.dark\\)\\s+\\.${selector}\\s*\\{`));
  }
  assert.equal(backgrounds[0].variable, "--token-bg-hue");
  assert.equal(backgrounds[1].variable, "--token-bg-dark-hue");
  assert.ok(backgrounds[0].saturation >= 80, "light backgrounds retain a strong color fill");
  assert.ok(backgrounds[0].lightness <= 88, "light backgrounds remain visibly colored rather than nearly white");
  assert.ok(backgrounds[1].saturation >= 55, "dark backgrounds retain a strong color fill");
  assert.ok(backgrounds[1].lightness >= 24, "dark backgrounds remain visibly colored rather than nearly black");
  function luminance(hue: number, { saturation, lightness }: Color) {
    const light = lightness / 100;
    const amplitude = saturation / 100 * Math.min(light, 1 - light);
    const rgb = [0, 8, 4].map((channel) => {
      const position = (channel + hue / 30) % 12;
      const value = light - amplitude * Math.max(-1, Math.min(position - 3, 9 - position, 1));
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  }
  const palettes = new Map<string, ReturnType<typeof tokenIdentity>>();
  for (let index = 0; index < 512; index++) {
    const identity = tokenIdentity(`0x${index.toString(16).padStart(40, "0")}`);
    palettes.set(`${identity.primaryHue}:${identity.secondaryHue}`, identity);
  }
  assert.equal(palettes.size, 8);
  for (const [palette, identity] of palettes) {
    const paletteHues = [identity.primaryHue, identity.secondaryHue];
    assert.ok(paletteHues.includes(identity.backgroundHue.light), `${palette} light background hue stays in the token palette`);
    assert.ok(paletteHues.includes(identity.backgroundHue.dark), `${palette} dark background hue stays in the token palette`);
    const hue = (color: Color) => {
      if (color.variable === "--token-accent-hue") return identity.secondaryHue;
      if (color.variable === "--token-bg-hue") return identity.backgroundHue.light;
      if (color.variable === "--token-bg-dark-hue") return identity.backgroundHue.dark;
      return identity.primaryHue;
    };
    for (const [index, theme] of ["light", "dark"].entries()) {
      const back = luminance(hue(backgrounds[index]), backgrounds[index]);
      for (const [tone, values] of [["primary", primary], ["secondary", secondary]] as const) {
        const front = luminance(hue(values[index]), values[index]);
        const contrast = (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05);
        assert.ok(contrast >= 4.5, `${theme} ${palette} ${tone} contrast ${contrast.toFixed(2)}:1 must be at least 4.5:1`);
      }
    }
  }
});
