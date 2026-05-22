import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import multer from 'multer';
import OpenAI from 'openai';

dotenv.config();

let openaiClient: OpenAI | null = null;
export function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OPENAI_API_KEY environment variable is required to use ChatGPT. Please configure it in your secrets.');
    }
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

const upload = multer({ storage: multer.memoryStorage() });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for search
  app.post('/api/search', upload.single('image'), async (req, res) => {
    try {
      const { prompt, tone = 'professional', provider = 'gemini' } = req.body;
      
      let systemInstruction = "You are G-ASK, an AI-powered search companion. Provide clear, accurate, and direct answers without unnecessary filler. Use Markdown for formatting, such as bold text, lists, and code blocks as appropriate. If the user asks a coding question, provide clear code snippets.";
      
      switch (tone) {
        case 'casual':
          systemInstruction += " Use a friendly, conversational, and energetic tone.";
          break;
        case 'creative':
          systemInstruction += " Be highly creative, witty, and imaginative in your response. Assume the persona of a brilliant inventive thinker.";
          break;
        case 'professional':
        default:
          systemInstruction += " Maintain a highly professional, objective, and analytical tone.";
          break;
      }

      // Stream to client with Server-Sent Events (SSE)
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      if (provider === 'openai') {
          if (!process.env.OPENAI_API_KEY) {
              res.write(`data: ${JSON.stringify({ text: "⚠️ **Missing OPENAI_API_KEY**\n\nThe `OPENAI_API_KEY` environment variable is required to use ChatGPT. Please configure it in your secrets panel." })}\n\n`);
              res.write('data: [DONE]\n\n');
              return res.end();
          }
          const openai = getOpenAI();
          const contentArray: any[] = [];
          if (req.file) {
              const base64 = req.file.buffer.toString('base64');
              contentArray.push({
                  type: 'image_url',
                  image_url: { url: `data:${req.file.mimetype};base64,${base64}` }
              });
          }
          contentArray.push({ type: 'text', text: prompt });

          const responseStream = await openai.chat.completions.create({
              model: "gpt-4o",
              stream: true,
              messages: [
                  { role: "system", content: systemInstruction },
                  { role: "user", content: contentArray as any }
              ]
          });

          for await (const chunk of responseStream) {
              const text = chunk.choices[0]?.delta?.content || '';
              if (text) {
                  res.write(`data: ${JSON.stringify({ text })}\n\n`);
              }
          }
          res.write('data: [DONE]\n\n');
          return res.end();
      }

      if (provider === 'imagen2') {
          const ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY,
            httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
          });

          res.write(`data: ${JSON.stringify({ text: "Generating image..." })}\n\n`);

          const response = await ai.models.generateImages({
              model: 'imagen-3.0-generate-002',
              prompt: prompt,
              config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                aspectRatio: '1:1',
              },
          });

          if (response.generatedImages && response.generatedImages.length > 0) {
             const base64EncodeString = response.generatedImages[0].image.imageBytes;
             const imageUrl = `data:image/jpeg;base64,${base64EncodeString}`;
             res.write(`data: ${JSON.stringify({ imageUrl })}\n\n`);
          } else {
             res.write(`data: ${JSON.stringify({ text: "\n\nError: Failed to generate image." })}\n\n`);
          }

          res.write('data: [DONE]\n\n');
          return res.end();
      }

      // Fallback/Default: Gemini Provider
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const contents: any[] = [];
      
      // Handle file upload
      if (req.file) {
        contents.push({
          inlineData: {
            data: req.file.buffer.toString('base64'),
            mimeType: req.file.mimetype
          }
        });
      }
      
      contents.push({ text: prompt });

      // Start streaming response
      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-2.5-pro',
        contents: contents,
        config: {
          systemInstruction,
          tools: [{ googleSearch: {} }],
          toolConfig: { includeServerSideToolInvocations: true },
        },
      });

      let groundUrls: any[] = [];

      for await (const chunk of responseStream) {
         if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) {
             const chunks = chunk.candidates[0].groundingMetadata.groundingChunks;
             for (const c of chunks) {
                 if (c.web?.uri && c.web?.title) {
                     if (!groundUrls.some(u => u.uri === c.web.uri)) {
                         groundUrls.push({ uri: c.web.uri, title: c.web.title });
                     }
                 }
             }
         }

         if (chunk.text) {
             res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
         }
      }

      // Send grounding URLs at the end if any exist
      if (groundUrls.length > 0) {
          res.write(`data: ${JSON.stringify({ sources: groundUrls })}\n\n`);
      }

      res.write('data: [DONE]\n\n');
      res.end();

    } catch (error: any) {
      console.error("Search API Error:", error);
      if (!res.headersSent) {
          res.status(500).json({ error: error.message || 'An error occurred during search.' });
      } else {
          res.write(`data: ${JSON.stringify({ text: `\n\n**Error:** ${error.message}` })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
      }
    }
  });


  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
