import React from 'react';
import ReactDOM from 'react-dom';
import * as THREE from 'three';

const CYCLES = 1000;

const VERTEX_SHADER = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const FRAG_SHADER = `
  uniform sampler2D texture;
  uniform float filter[9];
  uniform float divisor;

  varying vec2 vUv;

  void main() {
    float step = 1.0 / 1024.0;
    // Remember GLSL y goes downward
    gl_FragColor = (
        texture2D(texture, vec2(vUv.x - step, vUv.y + step)) * filter[0] +
        texture2D(texture, vec2(vUv.x, vUv.y + step)) * filter[1] +
        texture2D(texture, vec2(vUv.x + step, vUv.y + step)) * filter[2] +
        texture2D(texture, vec2(vUv.x - step, vUv.y)) * filter[3] +
        texture2D(texture, vUv) * filter[4] +
        texture2D(texture, vec2(vUv.x + step, vUv.y)) * filter[5] +
        texture2D(texture, vec2(vUv.x - step, vUv.y - step)) * filter[6] +
        texture2D(texture, vec2(vUv.x, vUv.y - step)) * filter[7] +
        texture2D(texture, vec2(vUv.x + step, vUv.y - step)) * filter[8]
      ) / divisor;
  }
`;

class WebGlDemo extends React.Component<{}, { ms: number; ppp: number }> {
  private canvas: HTMLCanvasElement | null = null;
  private lastTick = performance.now();

  public componentDidMount() {
    if (!this.canvas) {
      return;
    }
    const scene = new THREE.Scene();
    // Camera isn't actually used in the shader, but is needed for three.js
    const camera = new THREE.OrthographicCamera(-1024, 1024, -1024, 1024);
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      depth: false,
    });
    renderer.setSize(this.canvas.width, this.canvas.height);
    renderer.context.disable(renderer.context.DEPTH_TEST);
    renderer.autoClear = false;

    const texture = new THREE.TextureLoader().load('blocks-small.bmp', () => {
      this.animate(camera, scene, renderer);
    });

    const uniforms = {
      texture: { value: texture },
      filter: { value: [-1, 0, 1, -2, 0, 2, -1, 0, 1] },
      divisor: { value: 1 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAG_SHADER,
    });

    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
    const uvs = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
    const indices = [];
    for (let i = 0; i < CYCLES; i++) {
      indices.push(0, 1, 2, 0, 2, 3);
    }
    console.log('Rendering', indices.length, 'indecies');
    geometry.addAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.addAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
  }

  public render() {
    return (
      <div>
        <canvas width={1024} height={1024} ref={r => (this.canvas = r)} />
        {this.state && (
          <div>
            <p>
              Rendering {1024 * 1024 * CYCLES} pixels per frame. Last frame time
              was (milliseconds) {this.state.ms}
            </p>
            <p>
              That is {Math.round(this.state.ppp)} <b>picoseconds</b> per pixel.
              On a 4ghz machine that would be a{' '}
              <b>cycles per pixel of {(this.state.ppp * 4.0) / 1000.0}</b>
            </p>
          </div>
        )}
      </div>
    );
  }

  private animate(
    camera: THREE.Camera,
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer
  ) {
    requestAnimationFrame(() => this.animate(camera, scene, renderer));
    renderer.render(scene, camera);
    const now = performance.now();
    const deltaMs = now - this.lastTick;
    this.lastTick = now;
    // Calculate picoseconds per pixel
    const deltaPico = deltaMs * 1e9;
    const ppp = deltaPico / (1024 * 1024 * 1000);
    this.setState({ ms: deltaMs, ppp });
  }
}

ReactDOM.render(<WebGlDemo />, document.getElementById('root'));
