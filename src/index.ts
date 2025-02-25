import Fastify, {
    FastifyInstance,
    FastifyRequest,
    FastifyReply,
} from "fastify";
import OpenAI from "openai";
import { ReadableStream } from "node:stream/web";
import cors from "@fastify/cors";
import * as dotenv from "dotenv";

dotenv.config(); // 这将加载 .env 文件中的环境变量

// 创建一个 Fastify 实例
const fastify: FastifyInstance = Fastify({ logger: true });

// 注册 CORS 插件
fastify.register(cors, {
    origin: "*", // 允许所有域名访问
    methods: ["GET", "POST", "PUT", "DELETE"], // 允许的 HTTP 方法
    allowedHeaders: ["Content-Type", "Authorization", "Message"], // 允许的请求头
    credentials: true, // 是否允许发送凭据（如 cookies）
});

const openai = new OpenAI({
    // baseURL: "https://api.openai.com/v1",
    baseURL: process.env.OPENAI_BASE_URL,
    apiKey: process.env.OPENAI_API_KEY,
});

// 定义一个 GET 路由
fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    console.log(process.env.OPENAI_BASE_URL);
    return { hello: process.env.OPENAI_BASE_URL };
});

// 定义一个 POST 路由，接收 JSON 数据
fastify.post(
    "/data",
    {
        schema: {
            body: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    age: { type: "number" },
                },
                required: ["name", "age"],
            },
        },
    },
    async (
        request: FastifyRequest<{ Body: { name: string; age: number } }>,
        reply: FastifyReply
    ) => {
        const data = request.body;
        // 在这里可以对数据进行处理，比如保存到数据库
        return { received: data };
    }
);

// 内存缓存 存储大的system对象
let messageCache: string = "";

fastify.get(
    "/api/deepseek",
    async (request: FastifyRequest, reply: FastifyReply) => {
        const headers = request.headers;
        const message: string = headers["message"]?.toString() ?? "[]";
        const Message = JSON.parse(decodeURIComponent(message)); // 获取 System 头

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    console.log("messageCache length: ", messageCache.length);
                    controller.enqueue(
                        `data: ${JSON.stringify("[DONE]" + Math.random())}\n\n`
                    );
                    const deepseekStream = await openai.chat.completions.create(
                        {
                            messages: [
                                {
                                    role: "system",
                                    content: messageCache ?? "",
                                },
                                ...Message,
                            ],
                            // model: "deepseek-chat", // deepseek-reasoner
                            model: "gpt-3.5-turbo", // deepseek-reasoner
                            stream: true,
                            stream_options: { include_usage: true },
                        }
                    );

                    messageCache = ""; // 清空缓存

                    for await (const chunk of deepseekStream) {
                        const { choices = [], usage } = chunk;
                        if (choices.length === 0 && usage) {
                            console.log("usage", usage);
                            controller.enqueue(
                                `data: ${JSON.stringify("[DONE]")}\n\n`
                            );
                            // controller.close(); // 关闭数据流
                            // closeStream(); // 正确关闭流
                        }

                        if (choices.length > 0) {
                            const content = chunk.choices?.[0]?.delta?.content;
                            if (content) {
                                console.log("content: ", content);
                                // 发送数据到客户端
                                controller?.enqueue(
                                    `data: ${JSON.stringify(content)}\n\n`
                                );
                            }
                            if (chunk.choices?.[0]?.finish_reason === "stop") {
                                controller.enqueue(
                                    `data: ${JSON.stringify("[DONE]")}\n\n`
                                );
                            }
                        }
                    }
                    // closeStream(); // 再次确保关闭
                    controller.close(); // 关闭数据流
                } catch (err) {
                    console.error("error: ", err);
                    // controller.enqueue(`data: ${JSON.stringify("nextjs error")}\n\n`);
                    controller.close();
                    // closeStream(); // 再次确保关闭
                }
            },
        });

        reply.headers({
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Access-Control-Allow-Origin": "*", // 允许所有来源
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // 允许的方法
            "Access-Control-Allow-Headers":
                "Content-Type, Authorization, System, Message",
        });

        return stream;
    }
);

// 定义一个 POST 路由，接收 JSON 数据
fastify.post(
    "/api/deepseek",
    {
        schema: {
            body: {
                type: "object",
                properties: {
                    message: { type: "string" },
                },
                required: ["message"],
            },
        },
    },
    async (
        request: FastifyRequest<{ Body: { message: string } }>,
        reply: FastifyReply
    ) => {
        const { message } = request.body;
        // 存储数据
        messageCache = message;

        reply.headers({
            "Access-Control-Allow-Origin": "*", // 允许所有来源
        });

        // 在这里可以对数据进行处理，比如保存到数据库
        return { received: message };
    }
);

fastify.options(
    "/api/deepseek",
    async (request: FastifyRequest, reply: FastifyReply) => {
        console.log(232, "options");
        reply.headers({
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers":
                "Content-Type, Authorization, System, Message",
        });

        // 在这里可以对数据进行处理，比如保存到数据库
        return null;
    }
);

// 启动服务器并监听指定端口
const start = async () => {
    try {
        await fastify.listen({ port: 3000 }, (err) => {
            if (!err) {
                console.log("Server listening at http://localhost:3000");
            }
        });
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
