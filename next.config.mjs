/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Housekeeping photo/video uploads go through a Server Action
      // (submitForInspection / completeGeneralTask receive the media as
      // FormData). Next.js rejects Server Action bodies over 1 MB by default,
      // which silently blocked real phone-camera photos (2-8 MB) even though
      // the app's own validation allows up to 10 MB images / 50 MB video.
      // Raise the framework limit to match the app's declared maximums.
      //
      // NOTE: on Vercel the serverless request body is separately capped at
      // ~4.5 MB, so large videos still need the direct-to-storage upload path.
      bodySizeLimit: "55mb",
    },
  },
};

export default nextConfig;
