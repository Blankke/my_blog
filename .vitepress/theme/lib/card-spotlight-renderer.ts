const vertexShaderSource = `#version 300 es
precision mediump float;

in vec2 a_position;
uniform vec2 u_resolution;
out vec2 fragCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  fragCoord = (a_position + vec2(1.0)) * 0.5 * u_resolution;
  fragCoord.y = u_resolution.y - fragCoord.y;
}
`;

const fragmentShaderSource = `#version 300 es
precision mediump float;

in vec2 fragCoord;
uniform float u_time;
uniform float u_opacities[10];
uniform vec3 u_colors[6];
uniform float u_total_size;
uniform float u_dot_size;
uniform vec2 u_resolution;
out vec4 fragColor;

const float PHI = 1.61803398874989484820459;

float random(vec2 xy) {
  return fract(tan(distance(xy * PHI, xy) * 0.5) * xy.x);
}

void main() {
  vec2 st = fragCoord.xy;
  st.x -= abs(floor((mod(u_resolution.x, u_total_size) - u_dot_size) * 0.5));
  st.y -= abs(floor((mod(u_resolution.y, u_total_size) - u_dot_size) * 0.5));

  float opacity = step(0.0, st.x);
  opacity *= step(0.0, st.y);

  vec2 st2 = vec2(int(st.x / u_total_size), int(st.y / u_total_size));
  float frequency = 5.0;
  float show_offset = random(st2);
  float rand = random(
    st2 * floor((u_time / frequency) + show_offset + frequency) + 1.0
  );

  opacity *= u_opacities[int(rand * 10.0)];
  opacity *= 1.0 - step(
    u_dot_size / u_total_size,
    fract(st.x / u_total_size)
  );
  opacity *= 1.0 - step(
    u_dot_size / u_total_size,
    fract(st.y / u_total_size)
  );

  vec3 color = u_colors[int(show_offset * 6.0)];
  fragColor = vec4(color, opacity);
  fragColor.rgb *= fragColor.a;
}
`;

const opacities = new Float32Array([
  0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1,
]);

const darkColors = new Float32Array([
  59 / 255,
  130 / 255,
  246 / 255,
  59 / 255,
  130 / 255,
  246 / 255,
  59 / 255,
  130 / 255,
  246 / 255,
  139 / 255,
  92 / 255,
  246 / 255,
  139 / 255,
  92 / 255,
  246 / 255,
  139 / 255,
  92 / 255,
  246 / 255,
]);

const lightColors = new Float32Array([
  37 / 255,
  99 / 255,
  235 / 255,
  37 / 255,
  99 / 255,
  235 / 255,
  37 / 255,
  99 / 255,
  235 / 255,
  124 / 255,
  58 / 255,
  237 / 255,
  124 / 255,
  58 / 255,
  237 / 255,
  124 / 255,
  58 / 255,
  237 / 255,
]);

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
) {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Unable to create the Card Spotlight shader.');
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unknown shader error.';
    gl.deleteShader(shader);
    throw new Error(`Unable to compile the Card Spotlight shader: ${message}`);
  }

  return shader;
}

function createProgram(gl: WebGL2RenderingContext) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    fragmentShaderSource,
  );
  const program = gl.createProgram();

  if (!program) {
    throw new Error('Unable to create the Card Spotlight WebGL program.');
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Unknown program error.';
    gl.deleteProgram(program);
    throw new Error(`Unable to link the Card Spotlight program: ${message}`);
  }

  return program;
}

function getUniform(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
) {
  const location = gl.getUniformLocation(program, name);
  if (!location) {
    throw new Error(`Unable to find the Card Spotlight uniform "${name}".`);
  }

  return location;
}

export class CardSpotlightRenderer {
  readonly canvas: HTMLCanvasElement;

  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly timeUniform: WebGLUniformLocation;
  private readonly resolutionUniform: WebGLUniformLocation;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'card-spotlight-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');

    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      powerPreference: 'low-power',
      premultipliedAlpha: true,
      stencil: false,
    });

    if (!gl) {
      throw new Error('WebGL 2 is unavailable for Card Spotlight.');
    }

    this.gl = gl;
    this.program = createProgram(gl);
    this.timeUniform = getUniform(gl, this.program, 'u_time');
    this.resolutionUniform = getUniform(gl, this.program, 'u_resolution');

    const positionBuffer = gl.createBuffer();
    if (!positionBuffer) {
      throw new Error('Unable to create the Card Spotlight geometry.');
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const positionLocation = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.useProgram(this.program);
    gl.uniform1fv(getUniform(gl, this.program, 'u_opacities'), opacities);
    gl.uniform1f(getUniform(gl, this.program, 'u_total_size'), 4);
    gl.uniform1f(getUniform(gl, this.program, 'u_dot_size'), 3);

    gl.enable(gl.BLEND);
    this.setMode('dark');
  }

  resize(width: number, height: number) {
    const renderScale = 2;
    const nextWidth = Math.max(1, Math.ceil(width * renderScale));
    const nextHeight = Math.max(1, Math.ceil(height * renderScale));

    if (this.canvas.width === nextWidth && this.canvas.height === nextHeight) {
      return;
    }

    this.canvas.width = nextWidth;
    this.canvas.height = nextHeight;
    this.gl.viewport(0, 0, nextWidth, nextHeight);
    this.gl.useProgram(this.program);
    this.gl.uniform2f(this.resolutionUniform, nextWidth, nextHeight);
  }

  setMode(mode: 'light' | 'dark') {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniform3fv(
      getUniform(gl, this.program, 'u_colors'),
      mode === 'dark' ? darkColors : lightColors,
    );

    if (mode === 'dark') {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      return;
    }

    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  render(elapsedSeconds: number) {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniform1f(this.timeUniform, elapsedSeconds);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  clear() {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  destroy() {
    this.clear();
    this.gl.deleteProgram(this.program);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.canvas.remove();
  }
}
