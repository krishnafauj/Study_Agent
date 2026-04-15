import { createToolCallingAgent } from "langchain/agents";
import { AgentExecutor } from "langchain/agents";

import { model } from "./model.js";
import { tools } from "./tools.js";

export async function createAgent() {

  const agent = await createToolCallingAgent({
    llm: model,
    tools,
  });

  return new AgentExecutor({
    agent,
    tools,
  });

}