# @pipeworx/trefle

Trefle MCP — global plant database.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

- `search_plants(query, edible?, vegetable?, page?, page_size?)`
- `get_plant(plant_id)`
- `search_species(query, page?, page_size?)`
- `get_species(species_id)`
- `list_distributions(zone, page?, page_size?)` — TDWG WGSRPD zone codes

## Auth

- **Platform key:** gateway env `PLATFORM_TREFLE_KEY`.
- **BYO:** `?_apiKey=<token>` after registering at https://trefle.io.

## Data source

`https://trefle.io/api/v1/` — `?token=` query param. Upstream has been intermittently flaky in 2024–2026.

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "trefle": {
      "url": "https://gateway.pipeworx.io/trefle/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Trefle data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
