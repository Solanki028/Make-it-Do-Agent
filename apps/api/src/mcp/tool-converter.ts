import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { mcpClientManager } from './client-manager.js';

/**
 * Converts a JSON Schema object from MCP to a Zod schema.
 * Supports basic types (string, number, boolean, array, object).
 */
export function jsonSchemaToZod(schema: any): z.ZodTypeAny {
  if (!schema) {
    return z.object({});
  }

  const type = schema.type || (schema.properties ? 'object' : 'any');

  switch (type) {
    case 'string': {
      let validator = z.string();
      if (schema.description) {
        validator = validator.describe(schema.description) as any;
      }
      if (schema.enum) {
        return validator.and(z.enum(schema.enum as [string, ...string[]]));
      }
      return validator;
    }
    case 'number':
    case 'integer': {
      let validator = z.number();
      if (schema.description) {
        validator = validator.describe(schema.description) as any;
      }
      return validator;
    }
    case 'boolean': {
      let validator = z.boolean();
      if (schema.description) {
        validator = validator.describe(schema.description) as any;
      }
      return validator;
    }
    case 'array': {
      const itemsType = schema.items ? jsonSchemaToZod(schema.items) : z.any();
      let validator = z.array(itemsType);
      if (schema.description) {
        validator = validator.describe(schema.description) as any;
      }
      return validator;
    }
    case 'object': {
      const shape: Record<string, z.ZodTypeAny> = {};
      const required = schema.required || [];

      if (schema.properties) {
        for (const [key, prop] of Object.entries(schema.properties)) {
          let fieldZod = jsonSchemaToZod(prop);
          if (!required.includes(key)) {
            fieldZod = fieldZod.optional();
          }
          shape[key] = fieldZod;
        }
      }

      let validator = z.object(shape);
      if (schema.description) {
        validator = validator.describe(schema.description) as any;
      }
      return validator;
    }
    default:
      return z.any();
  }
}

/**
 * Wraps an MCP tool into a LangChain DynamicStructuredTool
 */
export function mcpToolToLangChain(
  serverName: string,
  tool: { name: string; description?: string; inputSchema: any }
): DynamicStructuredTool {
  const zodSchema = jsonSchemaToZod(tool.inputSchema);
  const namespacedName = `${serverName}__${tool.name}`;

  return new DynamicStructuredTool({
    name: namespacedName,
    description: tool.description || `Execute tool ${tool.name} on server ${serverName}`,
    schema: zodSchema as z.ZodObject<any>,
    func: async (args) => {
      console.log(`Executing LangChain tool: ${namespacedName} with args:`, args);
      try {
        const response = await mcpClientManager.executeTool(serverName, tool.name, args);
        if (response.content && Array.isArray(response.content)) {
          const texts = response.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text);
          return texts.join('\n');
        }
        return JSON.stringify(response);
      } catch (err: any) {
        console.error(`Error in LangChain tool call ${namespacedName}:`, err);
        throw new Error(err.message || `Failed to run tool ${tool.name}`);
      }
    },
  });
}
