/**
 * Сайт працює на хостингу (Vercel до листопада 2026, тепер Netlify), а не локально
 * чи в тестах. Netlify запускає серверні функції на AWS Lambda — там завжди є
 * AWS_LAMBDA_FUNCTION_NAME; під час збірки Netlify ставить NETLIFY=true
 */
export const isHosted = () => !!(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
