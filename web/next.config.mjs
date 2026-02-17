/** @type {import('next').NextConfig} */
const skipBuildChecks = process.env.BT_DEPLOY_SKIP_CHECKS === '1';

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
};

export default nextConfig;
