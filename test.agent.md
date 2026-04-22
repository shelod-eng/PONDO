---
name: Test Agent
description: >
  A minimal custom agent for testing agent workflows, tool restrictions, and context isolation in this workspace.
role: test-agent
---

# Test Agent

This agent is intended for validating agent customization, tool invocation, and prompt routing. It does not restrict tools or enforce a persona by default.

## Usage
- Use for testing agent selection and custom workflows.
- No tool restrictions by default.

## Example prompts
- "Test agent: What files are in the workspace?"
- "Test agent: Only use the file_search tool."

## Next steps
- Add tool restrictions or a persona if needed for your workflow.
- Create additional agents for other roles as required.
