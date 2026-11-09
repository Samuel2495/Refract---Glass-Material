import type { GlassParams } from "./types"

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`

// Procedural gradient backdrop; the glass samples it with refraction, dispersion and blur.
const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uBlur, uRefr, uDisp, uThick, uTint;

vec3 blob(vec2 p, vec2 c, float r, vec3 col){
  float d = distance(p, c);
  return col * smoothstep(r, r*0.25, d);
}
vec3 bg(vec2 uv){
  vec2 p = uv * vec2(uRes.x/uRes.y, 1.0);
  vec3 c = vec3(0.04, 0.03, 0.14);
  c += blob(p, vec2(0.25, 0.30), 0.55, vec3(1.0, 0.25, 0.60));
  c += blob(p, vec2(1.40, 0.20), 0.50, vec3(0.15, 0.50, 1.00));
  c += blob(p, vec2(0.90, 0.85), 0.55, vec3(1.00, 0.55, 0.15));
  c += blob(p, vec2(0.30, 0.95), 0.45, vec3(0.45, 0.20, 0.95));
  return c;
}
float sdBox(vec2 p, vec2 b, float r){
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float field(vec2 px, vec2 half, float r){ return sdBox(px, half, r); }

vec3 sampleBlur(vec2 uv, vec3 chanMask){
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
  vec2 half = uRes * vec2(0.31, 0.31);
  half.y = uRes.y * 0.30;
  float radius = min(half.x, half.y) * 0.35;
  vec2 c = px - uRes * 0.5;
  float d = field(c, half, radius);

  vec3 col;
  if (d > 0.0){
    col = bg(uv);
    col += vec3(0.8, 0.9, 1.0) * smoothstep(3.0, 0.0, d) * 0.35;
  } else {
    // Surface normal from the SDF gradient
    float e = 1.5;
    vec2 n = normalize(vec2(
      field(c + vec2(e,0.), half, radius) - field(c - vec2(e,0.), half, radius),
      field(c + vec2(0.,e), half, radius) - field(c - vec2(0.,e), half, radius)) + 1e-5);
    float bevel = 18.0 * uThick;
    float edge = pow(1.0 - clamp(-d / bevel, 0.0, 1.0), 2.0);
    vec2 wob = vec2(sin(c.y*0.045 + c.x*0.02), cos(c.x*0.04 - c.y*0.025)) * 0.25;
    vec2 off = (-n * edge + wob * 0.35) * uRefr * uThick * 70.0 / uRes;
    float disp = uDisp * 0.6;
    float r = sampleBlur(uv + off * (1.0 + disp), vec3(1.,0.,0.)).r;
    float g = sampleBlur(uv + off,               vec3(0.,1.,0.)).g;
    float b = sampleBlur(uv + off * (1.0 - disp), vec3(0.,0.,1.)).b;
    col = vec3(r, g, b);
    col = mix(col, col + vec3(0.55, 0.4, 0.9) * 0.25, uTint);
    col += vec3(1.0) * edge * 0.18;
    col += vec3(1.0) * smoothstep(2.0, 0.0, -d) * 0.5; // rim highlight
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
  if (!gl) return null
  try {
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, "p")
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const u = (n: string) => gl.getUniformLocation(prog, n)
    const U = { res: u("uRes"), blur: u("uBlur"), refr: u("uRefr"), disp: u("uDisp"), thick: u("uThick"), tint: u("uTint") }

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
      gl.uniform1f(U.blur, p.blur * dpr)
      gl.uniform1f(U.refr, p.refraction / 100)
      gl.uniform1f(U.disp, p.dispersion / 100)
      gl.uniform1f(U.thick, THICK[p.thickness])
      gl.uniform1f(U.tint, p.tint / 100)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    const ro = new ResizeObserver(() => last && draw(last))
    ro.observe(canvas)

    return {
      draw,
      destroy() {
        ro.disconnect()
        gl.getExtension("WEBGL_lose_context")?.loseContext()
      },
    }
  } catch (e) {
    console.warn("Refract: WebGL init failed", e)
    return null
  }
}
