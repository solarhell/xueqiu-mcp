#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { z } from "zod";

const USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

let cachedCookie = "";
let cookieTimestamp = 0;
const COOKIE_TTL = 24 * 60 * 60 * 1000;

async function ensureCookie(): Promise<string> {
	if (cachedCookie && Date.now() - cookieTimestamp < COOKIE_TTL) {
		return cachedCookie;
	}

	const resp = await fetch("https://xueqiu.com/about", {
		headers: { "User-Agent": USER_AGENT },
	});

	const setCookies = resp.headers.getSetCookie();
	for (const cookie of setCookies) {
		if (cookie.includes("xq_a_token=") && !cookie.includes("xq_a_token=;")) {
			cachedCookie = cookie.split(";")[0];
			cookieTimestamp = Date.now();
			return cachedCookie;
		}
	}

	throw new Error("获取cookie失败");
}

function invalidateCookie() {
	cachedCookie = "";
	cookieTimestamp = 0;
}

function xueqiuHeaders(cookie: string) {
	return { "User-Agent": USER_AGENT, Cookie: cookie };
}

// ---- Types ----

interface SuggestStockData {
	code: string;
	label: string;
	query: string;
	state: number;
	stock_type: number;
	type: number;
}

interface QuoteQuote {
	name: string;
	symbol: string;
	current: number;
	percent: number;
	chg: number;
	high: number;
	low: number;
	open: number;
	last_close: number;
	volume: number;
	amount: number;
	turnover_rate: number;
	volume_ratio: number | null;
	market_capital: number;
	float_market_capital: number | null;
	total_shares: number | null;
	float_shares: number | null;
	pe_ttm: number | null;
	pe_lyr: number | null;
	pe_forecast: number | null;
	pb: number | null;
	psr: number | null;
	eps: number;
	navps: number | null;
	dividend_yield: number | null;
	profit_four: number | null;
	currency: string;
	exchange: string;
	amplitude: number;
	high52w: number;
	low52w: number;
	current_year_percent: number;
	current_ext: number | null;
	percent_ext: number | null;
	chg_ext: number | null;
	timestamp: number;
	status: number;
}

// ---- API functions ----

async function searchStock(q: string): Promise<SuggestStockData[]> {
	const cookie = await ensureCookie();
	const url = new URL("https://xueqiu.com/query/v1/suggest_stock.json");
	url.searchParams.set("q", q);

	const resp = await fetch(url, { headers: xueqiuHeaders(cookie) });
	const data = (await resp.json()) as {
		code: number;
		success: boolean;
		data: SuggestStockData[];
	};

	if (data.code !== 200 || !data.success) {
		invalidateCookie();
		throw new Error(`搜索失败: ${JSON.stringify(data)}`);
	}

	return data.data;
}

async function getQuote(symbol: string): Promise<QuoteQuote> {
	const cookie = await ensureCookie();
	const url = new URL("https://stock.xueqiu.com/v5/stock/quote.json");
	url.searchParams.set("symbol", symbol);
	url.searchParams.set("extend", "detail");

	const resp = await fetch(url, { headers: xueqiuHeaders(cookie) });
	const data = (await resp.json()) as {
		data: { quote: QuoteQuote };
		error_code: number;
		error_description: string;
	};

	if (data.error_code !== 0) {
		invalidateCookie();
		throw new Error(`获取行情失败: ${data.error_description}`);
	}

	return data.data.quote;
}

async function resolveSymbol(input: string): Promise<string> {
	if (/^[A-Z.]/.test(input) || /^(SH|SZ|HK)\d+$/i.test(input)) {
		return input.toUpperCase();
	}
	const results = await searchStock(input);
	if (results.length === 0) throw new Error(`没有找到: ${input}`);
	return results[0].code;
}

// ---- Helpers ----

function fmtNum(n: number | null | undefined): string {
	if (n == null) return "-";
	const abs = Math.abs(n);
	if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}万亿`;
	if (abs >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
	if (abs >= 1e4) return `${(n / 1e4).toFixed(2)}万`;
	return n.toLocaleString("en-US");
}

function fmtVal(n: number | null | undefined, suffix = ""): string {
	if (n == null) return "-";
	return `${n}${suffix}`;
}

function fmtSign(n: number | null | undefined, suffix = ""): string {
	if (n == null) return "-";
	const sign = n >= 0 ? "+" : "";
	return `${sign}${n}${suffix}`;
}

function fmtTime(ts: number): string {
	return new Date(ts).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function tradingStatus(status: number): string {
	const map: Record<number, string> = {
		1: "交易中",
		2: "盘前",
		3: "盘后",
		4: "已收盘",
		5: "休市",
	};
	return map[status] ?? `未知(${status})`;
}

// ---- Formatters ----

function formatQuote(q: QuoteQuote): string {
	const lines: string[] = [
		`${q.name}(${q.symbol}) ${q.exchange}  ${fmtSign(q.chg)} ${fmtSign(q.percent, "%")}  现价: ${q.current} ${q.currency}`,
		`[${tradingStatus(q.status)}] ${fmtTime(q.timestamp)}`,
	];

	// 盘前盘后（美股）
	if (q.current_ext != null) {
		lines.push(
			`盘前/盘后: ${q.current_ext} ${fmtSign(q.chg_ext)} ${fmtSign(q.percent_ext, "%")}`,
		);
	}

	lines.push(
		"",
		`今开: ${q.open}  昨收: ${q.last_close}`,
		`最高: ${q.high}  最低: ${q.low}`,
		`振幅: ${q.amplitude}%`,
		`成交量: ${fmtNum(q.volume)}  成交额: ${fmtNum(q.amount)}`,
		`换手率: ${fmtVal(q.turnover_rate, "%")}  量比: ${fmtVal(q.volume_ratio)}`,
		"",
		`总市值: ${fmtNum(q.market_capital)}  流通市值: ${fmtNum(q.float_market_capital)}`,
		`总股本: ${fmtNum(q.total_shares)}  流通股: ${fmtNum(q.float_shares)}`,
		"",
		`市盈率(TTM): ${fmtVal(q.pe_ttm)}  市盈率(静): ${fmtVal(q.pe_lyr)}  市盈率(预): ${fmtVal(q.pe_forecast)}`,
		`市净率: ${fmtVal(q.pb)}  市销率: ${fmtVal(q.psr)}`,
		`每股收益: ${fmtVal(q.eps)}  每股净资产: ${fmtVal(q.navps)}`,
		`股息率: ${fmtVal(q.dividend_yield, "%")}  近四季利润: ${fmtNum(q.profit_four)}`,
		"",
		`52周最高: ${q.high52w}  52周最低: ${q.low52w}`,
		`年初至今: ${fmtSign(q.current_year_percent, "%")}`,
	);

	return lines.join("\n");
}

function stockTypeLabel(stockType: number): string {
	const map: Record<number, string> = {
		1: "沪A",
		2: "深A",
		3: "北A",
		6: "美股",
		12: "港股通",
		30: "港股",
		81: "指数",
		82: "指数",
	};
	return map[stockType] ?? "";
}

function formatSearchResult(results: SuggestStockData[]): string {
	if (results.length === 0) return "没有找到匹配的股票";
	return results
		.map((r, i) => {
			const tag = stockTypeLabel(r.stock_type);
			return `${i + 1}. ${r.query} (${r.code})${tag ? ` [${tag}]` : ""}`;
		})
		.join("\n");
}

function formatMultiQuotes(quotes: QuoteQuote[]): string {
	return quotes
		.map(
			(q) =>
				`${q.name}(${q.symbol}): ${q.current} ${fmtSign(q.chg)} ${fmtSign(q.percent, "%")}  成交额: ${fmtNum(q.amount)}`,
		)
		.join("\n");
}

// ---- MCP Server ----

const MARKET_INDICES: Record<string, string[]> = {
	cn: ["SH000001", "SZ399001", "SZ399006"],
	us: [".DJI", ".IXIC", ".INX"],
	hk: ["HSI", "HSCEI", "HSTECH"],
};

function createServer(): McpServer {
	const server = new McpServer({
		name: "xueqiu-mcp",
		version: "1.0.0",
	});

	server.tool(
		"search_stock",
		"搜索股票，返回匹配的股票列表（代码、名称、市场类型）。当不确定具体股票代码时使用",
		{ query: z.string().describe("搜索关键词，如 腾讯、茅台、AAPL") },
		async ({ query }) => {
			try {
				const results = await searchStock(query);
				return {
					content: [{ type: "text", text: formatSearchResult(results) }],
				};
			} catch (e) {
				return {
					content: [{ type: "text", text: `错误: ${(e as Error).message}` }],
					isError: true,
				};
			}
		},
	);

	server.tool(
		"get_stock",
		"查询单只股票详细数据，包括：实时价格、涨跌幅、盘前盘后(美股)、成交量/额、量比、换手率、总市值/流通市值、市盈率(TTM/静态/预测)、市净率、市销率、每股收益/净资产、股息率、近四季利润、52周高低、交易状态。支持传入名称或代码，会自动搜索匹配股票代码",
		{
			symbol: z
				.string()
				.describe("股票名称或代码，如 腾讯、SH600519、AAPL、coinbase"),
		},
		async ({ symbol }) => {
			try {
				const code = await resolveSymbol(symbol);
				const quote = await getQuote(code);
				return { content: [{ type: "text", text: formatQuote(quote) }] };
			} catch (e) {
				return {
					content: [{ type: "text", text: `错误: ${(e as Error).message}` }],
					isError: true,
				};
			}
		},
	);

	server.tool(
		"get_stocks",
		"批量查询多只股票的实时价格、涨跌额、涨跌幅和成交额，支持传入名称或代码",
		{
			symbols: z
				.array(z.string())
				.describe("股票名称或代码数组，如 ['腾讯', 'AAPL', '茅台']"),
		},
		async ({ symbols }) => {
			try {
				const codes = await Promise.all(symbols.map(resolveSymbol));
				const quotes = await Promise.all(codes.map(getQuote));
				return {
					content: [{ type: "text", text: formatMultiQuotes(quotes) }],
				};
			} catch (e) {
				return {
					content: [{ type: "text", text: `错误: ${(e as Error).message}` }],
					isError: true,
				};
			}
		},
	);

	server.tool(
		"get_market_index",
		"查询大盘指数行情（价格、涨跌额、涨跌幅），支持 A股(cn)、美股(us)、港股(hk)",
		{
			market: z
				.enum(["cn", "us", "hk"])
				.describe("市场: cn=A股, us=美股, hk=港股"),
		},
		async ({ market }) => {
			try {
				const symbols = MARKET_INDICES[market];
				const quotes = await Promise.all(symbols.map(getQuote));
				return {
					content: [{ type: "text", text: formatMultiQuotes(quotes) }],
				};
			} catch (e) {
				return {
					content: [{ type: "text", text: `错误: ${(e as Error).message}` }],
					isError: true,
				};
			}
		},
	);

	return server;
}

// ---- Transport ----

const transportType = (process.env.MCP_TRANSPORT_TYPE ?? "stdio").toLowerCase();

if (transportType === "http") {
	const port = Number.parseInt(process.env.MCP_HTTP_PORT ?? "3000", 10);
	const app = new Hono();

	app.get("/", (c) =>
		c.json({ name: "xueqiu-mcp", version: "1.0.0", transport: "http" }),
	);

	app.all("/mcp", async (c) => {
		const server = createServer();
		const transport = new WebStandardStreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
		});
		await server.connect(transport);
		return transport.handleRequest(c.req.raw);
	});

	console.error(
		`xueqiu-mcp HTTP server listening on http://localhost:${port}/mcp`,
	);

	const nodeServer = await import("@hono/node-server");
	nodeServer.serve({ fetch: app.fetch, port });
} else {
	const server = createServer();
	const transport = new StdioServerTransport();
	await server.connect(transport);
}
