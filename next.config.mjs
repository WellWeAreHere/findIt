/** @type {import('next').NextConfig} */
const nextConfig = {
  // Native/DB drivers run only on the server and must not be bundled.
  serverExternalPackages: ['mysql2', 'mongodb', 'bcryptjs'],
  // Uploaded images are served by our own authorised route, not the optimiser.
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default nextConfig;
