import type { GlassParams } from "./types"

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`

// Samples the selected element (uTex) when available, otherwise a procedural gradient.
const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform vec2 uImg;
uniform float uHasTex;
uniform sampler2D uTex;
uniform float uBlur, uRefr, uDisp, uThick, uTint;

vec3 blob(vec2 p, vec2 c, float r, vec3 col){
  float d = distance(p, c);
  return col * smoothstep(r, r*0.25, d);
}
vec3 procBg(vec2 uv){
  vec2 p = uv * vec2(uRes.x/uRes.y, 1.0);
  vec3 c = vec3(0.04, 0.03, 0.14);
  c += blob(p, vec2(0.25, 0.30), 0.55, vec3(1.0, 0.25, 0.60));
  c += blob(p, vec2(1.40, 0.20), 0.50, vec3(0.15, 0.50, 1.00));
  c += blob(p, vec2(0.90, 0.85), 0.55, vec3(1.00, 0.55, 0.15));
  c += blob(p, vec2(0.30, 0.95), 0.45, vec3(0.45, 0.20, 0.95));
  return c;
}
vec2 coverUV(vec2 uv){
  float ca = uRes.x / uRes.y;
  float ia = uImg.x / uImg.y;
  vec2 s = ca > ia ? vec2(1.0, ia / ca) : vec2(ca / ia, 1.0);
  return (uv - 0.5) * s + 0.5;
}
vec3 bg(vec2 uv){
  if (uHasTex < 0.5) return procBg(uv);
  vec4 t = texture2D(uTex, clamp(coverUV(uv), 0.0, 1.0));
  return mix(vec3(0.09, 0.09, 0.12), t.rgb, t.a);
}
float sdBox(vec2 p, vec2 b, float r){
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float field(vec2 px, vec2 hs, float r){ return sdBox(px, hs, r); }

vec3 sampleBlur(vec2 uv){
  vec3 acc = vec3(0.0);
  float rad = uBlur / uRes.y;
  for (int i = 0; i < 12; i++){
    float a = float(i) * 0.5236 * 2.0;
    float k = 0.35 + 0.65 * fract(float(i) * 0.618);
    vec2 o = vec2(cos(a), sin(a)) * rad * k;
    acc += bg(uv + o);
  }
  return acc / 12.0;
}

void main(){
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 uv = px / uRes;
  vec2 hs = uRes * vec2(0.31, 0.31);
  hs.y = uRes.y * 0.30;
  float radius = min(hs.x, hs.y) * 0.35;
  vec2 c = px - uRes * 0.5;
  float d = field(c, hs, radius);

  vec3 col;
  if (d > 0.0){
    col = bg(uv);
    col += vec3(0.8, 0.9, 1.0) * smoothstep(3.0, 0.0, d) * 0.35;
  } else {
    float e = 1.5;
    vec2 n = normalize(vec2(
      field(c + vec2(e,0.), hs, radius) - field(c - vec2(e,0.), hs, radius),
      field(c + vec2(0.,e), hs, radius) - field(c - vec2(0.,e), hs, radius)) + 1e-5);
    float bevel = 18.0 * uThick;
    float edge = pow(1.0 - clamp(-d / bevel, 0.0, 1.0), 2.0);
    vec2 wob = vec2(sin(c.y*0.045 + c.x*0.02), cos(c.x*0.04 - c.y*0.025)) * 0.25;
    vec2 off = (-n * edge + wob * 0.35) * uRefr * uThick * 70.0 / uRes;
    float disp = uDisp * 0.6;
    float r = sampleBlur(uv + off * (1.0 + disp)).r;
    float g = sampleBlur(uv + off).g;
    float b = sampleBlur(uv + off * (1.0 - disp)).b;
    col = vec3(r, g, b);
    col = mix(col, col + vec3(0.55, 0.4, 0.9) * 0.25, uTint);
    col += vec3(1.0) * edge * 0.18;
    col += vec3(1.0) * smoothstep(2.0, 0.0, -d) * 0.5;
  }
  gl_FragColor = vec4(col, 1.0);
}
`

const THICK = { low: 0.6, medium: 1.0, high: 1.5 }

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error")
  return s
}

export function createRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl", { antialias: true })
  if (!gl || gl.isContextLost()) return null
  try {
    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link error")
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, "p")
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const u = (n: string) => gl.getUniformLocation(prog, n)
    const U = {
      res: u("uRes"), img: u("uImg"), hasTex: u("uHasTex"), tex: u("uTex"),
      blur: u("uBlur"), refr: u("uRefr"), disp: u("uDisp"), thick: u("uThick"), tint: u("uTint"),
    }

    const tex = gl.createTexture()
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]))
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.uniform1i(U.tex, 0)

    let hasTex = 0
    let imgW = 1
    let imgH = 1
    let last: GlassParams | null = null

    const draw = (p: GlassParams) => {
      last = p
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr))
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, w, h)
      gl.uniform2f(U.res, w, h)
      gl.uniform2f(U.img, imgW, imgH)
      gl.uniform1f(U.hasTex, hasTex)
      gl.uniform1f(U.blur, p.blur * dpr)
      gl.uniform1f(U.refr, p.refraction / 100)
      gl.uniform1f(U.disp, p.dispersion / 100)
      gl.uniform1f(U.thick, THICK[p.thickness])
      gl.uniform1f(U.tint, p.tint / 100)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }

    const setImage = (img: HTMLImageElement | null) => {
      if (!img || !img.naturalWidth) {
        hasTex = 0
      } else {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
        imgW = img.naturalWidth
        imgH = img.naturalHeight
        hasTex = 1
      }
      if (last) draw(last)
    }

    const ro = new ResizeObserver(() => last && draw(last))
    ro.observe(canvas)

    return {
      draw,
      setImage,
      destroy() {
        ro.disconnect()
        // NOTE: do NOT call WEBGL_lose_context here. React StrictMode mounts, unmounts and
        // remounts the same <canvas>; getContext() would then return the dead (lost) context
        // and the preview would stay black. Free our own resources instead.
        gl.deleteTexture(tex)
        gl.deleteBuffer(buf)
        gl.deleteProgram(prog)
        gl.deleteShader(vs)
        gl.deleteShader(fs)
      },
    }
  } catch (e) {
    console.warn("Refract: WebGL init failed", e)
    return null
  }
}