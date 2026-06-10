export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ==================== OpenAI 兼容接口 ====================
interface OpenAIRequest {
  model: string;
  messages: AIMessage[];
  temperature?: number;
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

// ==================== Anthropic 兼容接口 ====================
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: AnthropicMessage[];
  temperature?: number;
}

interface AnthropicResponse {
  content: Array<{
    type: string;
    text?: string;
  }>;
  error?: { message: string };
}

// ==================== 配置接口 ====================
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
  let baseUrl = config.api_base_url.replace(/\/$/, '');

  // === 步骤 1：判断 API 类型（OpenAI / Anthropic）===
  // 用户填写的 baseUrl：
  //   OpenAI 格式  → https://api.deepseek.com
  //   Anthropic 格式 → https://api.deepseek.com/anthropic
  const isAnthropic = baseUrl.includes('/anthropic');

  // === 步骤 2：自动补全 baseUrl ===
  if (!isAnthropic) {
    // OpenAI 兼容格式：需要补 /v1
    if (baseUrl === 'https://api.deepseek.com') {
      baseUrl = 'https://api.deepseek.com/v1';
    } else if (baseUrl === 'https://api.openai.com') {
      baseUrl = 'https://api.openai.com/v1';
    }
  }

  try {
    // === 步骤 3：根据 API 类型构造不同的请求 ===
    if (isAnthropic) {
      // ---------- Anthropic 格式请求 ----------
      // 把 system 消息抽出来（Anthropic 将 system 作为独立参数）
      const systemMessages = messages.filter((m) => m.role === 'system');
      const chatMessages = messages.filter((m) => m.role !== 'system');

      // Anthropic 必须至少有一条 user 消息，且不能用 assistant 作为最后一条
      const anthropicMessages: AnthropicMessage[] = chatMessages.map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      }));

      // 如果最后一条不是 user，补一条空 user 消息
      if (
        anthropicMessages.length === 0 ||
        anthropicMessages[anthropicMessages.length - 1].role !== 'user'
      ) {
        anthropicMessages.push({ role: 'user', content: '请继续' });
      }

      const body: AnthropicRequest = {
        model: config.model,
        max_tokens: 4096,
        temperature,
        system: systemMessages.map((m) => m.content).join('\n\n') || undefined,
        messages: anthropicMessages,
      };

      const url = `${baseUrl}/v1/messages`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.api_key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`AI API 调用失败 (Anthropic, ${response.status}): ${errText}`);
      }

      const data = (await response.json()) as AnthropicResponse;
      const text = data.content?.find((c) => c.type === 'text')?.text;
      if (!text) {
        throw new Error('AI API 未返回有效内容');
      }
      return text.trim();
    } else {
      // ---------- OpenAI 格式请求 ----------
      const body: OpenAIRequest = {
        model: config.model,
        messages,
        temperature,
      };

      const url = `${baseUrl}/chat/completions`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.api_key}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`AI API 调用失败 (OpenAI, ${response.status}): ${errText}`);
      }

      const data = (await response.json()) as OpenAIResponse;
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('AI API 未返回有效内容');
      }
      return content.trim();
    }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`网络请求失败，请检查网络连接或 API 地址是否正确: ${baseUrl}`);
    }
    throw error;
  }
}
