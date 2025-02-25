// env.d.ts
declare namespace NodeJS {
    interface ProcessEnv {
        NODE_ENV: string;
        OPENAI_BASE_URL: string;
        OPENAI_API_KEY: string;
        // ... 其他环境变量
    }
}
