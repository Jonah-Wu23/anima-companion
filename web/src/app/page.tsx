const apiPayloadExample = `{
  "text": "你好，今天想聊什么？",
  "text_lang": "zh",
  "ref_audio_path": "参考音频/xxx.wav",
  "prompt_lang": "zh",
  "prompt_text": "你好，今天想聊什么？"
}`;

export default function HomePage() {
  return (
    <main className="container">
      <h1>Anima Companion Web MVP</h1>
      <p>当前阶段目标：先跑通网页端文本/语音/3D 交互主链路。</p>

      <section className="panel">
        <h2>当前技术栈</h2>
        <ul>
          <li>前端：Next.js + React + TypeScript</li>
          <li>3D：Three.js（后续接入角色渲染与口型驱动）</li>
          <li>后端：FastAPI（已接 GPT-SoVITS 本地代理）</li>
        </ul>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>TTS 代理接口示例</h2>
        <pre>{apiPayloadExample}</pre>
      </section>
    </main>
  );
}
