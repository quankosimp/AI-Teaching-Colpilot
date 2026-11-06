-- OpenAI as an AI provider (in addition to the legacy Gemini value).
ALTER TYPE "AIProvider" ADD VALUE IF NOT EXISTS 'openai';
