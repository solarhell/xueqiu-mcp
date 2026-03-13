# xueqiu-mcp

[![npm version](https://img.shields.io/npm/v/xueqiu-mcp)](https://www.npmjs.com/package/xueqiu-mcp)
[![npm downloads](https://img.shields.io/npm/dm/xueqiu-mcp)](https://www.npmjs.com/package/xueqiu-mcp)
[![CI](https://github.com/solarhell/xueqiu-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/solarhell/xueqiu-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

雪球股票数据 MCP Server，提供 A股、港股、美股的实时行情查询。

## 功能

| 工具 | 说明 |
| --- | --- |
| `search_stock` | 搜索股票，返回匹配的股票列表（代码和名称） |
| `get_stock` | 查询单只股票详细数据（价格、涨跌幅、市值、市盈率、股息率等） |
| `get_stocks` | 批量查询多只股票的实时价格和涨跌幅 |
| `get_market_index` | 查询大盘指数行情，支持 A股(cn)、美股(us)、港股(hk) |

## 安装

### bunx（推荐）

无需安装，直接在 MCP 客户端配置中使用：

```json
{
  "mcpServers": {
    "xueqiu-mcp": {
      "command": "bunx",
      "args": ["-y", "xueqiu-mcp"]
    }
  }
}
```

### 全局安装

```bash
npm install -g xueqiu-mcp
```

## 配置

### Claude Code

```bash
claude mcp add xueqiu-mcp -- bunx -y xueqiu-mcp
```

### HTTP 模式

如果需要通过 HTTP 方式接入：

```bash
MCP_TRANSPORT_TYPE=http MCP_HTTP_PORT=3000 bunx xueqiu-mcp
```

服务启动后，MCP 端点为 `http://localhost:3000/mcp`。

## 使用示例

配置完成后，在 AI 对话中直接提问即可：

- "搜索腾讯相关的股票"
- "查一下茅台的股价"
- "帮我看看 AAPL 和 TSLA 的行情"
- "今天 A股大盘怎么样"

## 开发

```bash
# 安装依赖
bun install

# 启动（stdio 模式）
bun run start

# 启动（HTTP 模式）
bun run start:http

# 使用 MCP Inspector 调试
bun run inspector

# 代码检查
bun run check

# 构建
bun run build
```

## 许可证

MIT
