import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const skipBuildChecks = process.env.BT_DEPLOY_SKIP_CHECKS === '1';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // 仅在资源受限的部署环境跳过，避免 OOM；本地/CI 仍保留检查。
    ignoreDuringBuilds: skipBuildChecks,
  },
  typescript: {
    // 仅在资源受限的部署环境跳过，避免 OOM；本地/CI 仍保留检查。
    ignoreBuildErrors: skipBuildChecks,
  },
  webpack: (config) => {
    // 强制全项目共用同一份 three，避免 MMD/R3F 出现多实例导致的运行时异常。
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      three: path.resolve(__dirname, 'node_modules/three'),
    };

    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      {
        module: /onnxruntime-web[\\/]dist[\\/]ort\.min\.js$/,
        message:
          /Critical dependency: require function is used in a way in which dependencies cannot be statically extracted/,
      },
    ];
    return config;
  },
  async headers() {
    return [
      {
        source: '/vad-web/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' },
        ],
      },
      {
        source: '/onnxruntime/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' },
        ],
      },
      {
        source: '/vad-web-2026-02-22-1/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' },
        ],
      },
      {
        source: '/onnxruntime-2026-02-22-1/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' },
        ],
      },
    ];
  },
};

export default nextConfig;
