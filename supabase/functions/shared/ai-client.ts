export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: AIMessage[];
  temperature?: number;
}

export interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export interface UserAIConfig {
  api_base_url: string;
  api_key: string;
  model: string;
}

export async function callAI(
  config: UserAIConfig,
  messages: AIMessage[],
  temperature = 0.7,
): Promise<string> {
  const baseUrl = config.api_base_url.replace(/\/$/, '');
  let url = `${baseUrl}/chat/completions`;

  const body: ChatCompletionRequest = {
    model: config.model,
    messages,
    temperature,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.api_key}`,
  };

  if (baseUrl.includes('openai.com')) {
    url = 'https://api.openai.com/v1/chat/completions';
  } else if (baseUrl.includes('anthropic.com')) {
    throw new Error('暂不支持 Anthropic API');
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      timeout: 60000,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI API 调用失败 (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('AI API 未返回有效内容');
    }
    return content.trim();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`网络请求失败，请检查网络连接或 API 地址是否正确: ${baseUrl}`);
    }
    throw error;
  }
}
