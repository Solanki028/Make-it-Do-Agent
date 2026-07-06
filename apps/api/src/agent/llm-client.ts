import { ChatOpenAI } from '@langchain/openai';
import { BaseMessage } from '@langchain/core/messages';
import { env } from '../config/env.js';

export class CustomChatClient {
  private model: ChatOpenAI;

  constructor(fields?: { temperature?: number }) {
    const apiKey = env.GITHUB_TOKEN || process.env.GITHUB_TOKEN || '';
    
    this.model = new ChatOpenAI({
      openAIApiKey: apiKey,
      modelName: 'gpt-4o-mini',
      temperature: fields?.temperature ?? 0,
      configuration: {
        baseURL: 'https://models.inference.ai.azure.com',
      },
    });
  }

  async invoke(messages: BaseMessage[]) {
    if (!this.model.openAIApiKey) {
      throw new Error("GITHUB_TOKEN is missing! Please configure it in your apps/api/.env file.");
    }
    return this.model.invoke(messages);
  }
}
