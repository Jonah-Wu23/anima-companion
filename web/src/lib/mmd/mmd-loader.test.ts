import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveMmdTextureRequestPath } from './mmd-loader';

describe('resolveMmdTextureRequestPath', () => {
  it('不改写默认 toon 贴图', () => {
    const result = resolveMmdTextureRequestPath('toon03.bmp', { isDefaultToonTexture: true }, true);
    assert.equal(result, 'toon03.bmp');
  });

  it('不改写绝对 URL', () => {
    const result = resolveMmdTextureRequestPath('https://cdn.example.com/model/tex/face.png', undefined, true);
    assert.equal(result, 'https://cdn.example.com/model/tex/face.png');
  });

  it('按扩展名改写为 webp', () => {
    const cases: Array<[string, string]> = [
      ['face.png', 'face.webp'],
      ['face.jpg', 'face.webp'],
      ['face.jpeg', 'face.webp'],
      ['face.bmp', 'face.webp'],
      ['face.tga', 'face.webp'],
      ['face.gif', 'face.webp'],
      ['face.sph', 'face.webp'],
      ['face.spa', 'face.webp'],
      ['tex/face.tga?ver=2#part', 'tex/face.webp?ver=2#part'],
    ];

    cases.forEach(([input, expected]) => {
      assert.equal(resolveMmdTextureRequestPath(input, undefined, true), expected);
    });
  });

  it('开关关闭时保留原始路径', () => {
    const result = resolveMmdTextureRequestPath('face.png', undefined, false);
    assert.equal(result, 'face.png');
  });
});
