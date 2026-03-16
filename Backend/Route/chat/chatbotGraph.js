import { ChatGroq } from "@langchain/groq";
import { StateGraph } from "@langchain/langgraph";

export const model = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  temperature: 0
});

async function chatNode(state) {
  const response = await model.invoke(state.message);

  return {
    response: response.content,
  };
}

const graph = new StateGraph({
  channels: {
    message: "string",
    response: "string",
  },
});

graph.addNode("chat", chatNode);
graph.setEntryPoint("chat");

export const chatbot = graph.compile();