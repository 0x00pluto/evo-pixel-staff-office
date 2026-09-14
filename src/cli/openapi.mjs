/**
 * OpenAPI 3.1 document builder + GET /api/openapi.json handler.
 * Single source of truth for the HTTP contract (no Swagger UI).
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BLOCKED_TTL_MS,
  PRESENCE_STATES,
  SUMMARY_MAX_CHARS,
  WORKING_TTL_MS,
} from './presence-store.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../..')

function packageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

const WORKING_TTL_SEC = WORKING_TTL_MS / 1000
const BLOCKED_TTL_SEC = BLOCKED_TTL_MS / 1000

/**
 * @returns {Record<string, unknown>}
 */
export function buildOpenApiDocument() {
  const presenceStates = [...PRESENCE_STATES]

  return {
    openapi: '3.1.0',
    info: {
      title: 'pixel-office HTTP API',
      version: packageVersion(),
      description: [
        '像素数字员工办公室大屏的机器可读 HTTP 合同（OpenAPI 3.1 JSON，无 Swagger UI）。',
        '',
        '## Agent 出勤合同',
        '- 开干 → POST `state: working`',
        '- 卡住 **或** 做完待验收 → POST `state: blocked`（禁止刚做完直接 `idle`）',
        '- 灭灯 / 已读 → POST `state: idle`（与大屏点击黄灯等价）',
        '',
        '出勤存在进程内内存表；进程重启后全员隐式 idle。',
        `读时分态 TTL：working ${WORKING_TTL_SEC}s → 合成 idle；blocked ${BLOCKED_TTL_SEC}s → 合成 idle。`,
        `summary 最长 ${SUMMARY_MAX_CHARS} 字（超长截断 + …）；空或缺省 = 不改已存 summary。`,
        '',
        '花名册与出勤是两张表：`GET /api/catalog` 谁在办公室；`POST /api/catalog` 整表注入并持久化到用户目录；`GET/POST /api/presence` 谁在干活。',
        '无本地 CATALOG.json 也可启动（空态 agents: []）。用法说明见仓库 `docs/openapi.md`。',
      ].join('\n'),
    },
    servers: [{ url: '/', description: '相对当前 origin（dev 5173 / pixel-office 3780）' }],
    paths: {
      '/api/openapi.json': {
        get: {
          operationId: 'getOpenApiDocument',
          summary: '本 OpenAPI 3.1 文档',
          description: '返回与本文件相同的 JSON 合同；运行时由代码生成，无 HTML UI。与 /api/catalog、/api/presence 同前缀。',
          responses: {
            '200': {
              description: 'OpenAPI 3.1 document',
              content: {
                'application/json': {
                  schema: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
      },
      '/api/catalog': {
        get: {
          operationId: 'getCatalog',
          summary: '花名册（谁在办公室）',
          description: [
            '只渲染 workspaces[]；unmanaged 不进办公室。',
            '空态合法：无用户目录/种子时返回 agents: []。',
            '`?refresh=1` 优先重读用户目录持久化文件。',
          ].join(' '),
          parameters: [
            {
              name: 'refresh',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['1'] },
              description: '传 `1` 时强制重新加载花名册',
            },
          ],
          responses: {
            '200': {
              description: 'CatalogPayload（可为空 agents）',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CatalogPayload' },
                  examples: {
                    sample: {
                      value: {
                        sourcePath: '/path/to/.pixel-office/catalog.json',
                        wiki_index_version: '1',
                        generated_at: '2026-09-14T00:00:00Z',
                        agents: [
                          {
                            id: 'pixel-office',
                            name: '像素办公室',
                            title: '像素办公室 — 大屏',
                            status: '待命',
                            blurb: '',
                            lifecycle: 'active',
                            owns: [],
                            not: '',
                            siblings: [],
                            skin: 0,
                            tint: 0,
                          },
                        ],
                      },
                    },
                    empty: {
                      value: {
                        sourcePath: 'runtime:empty',
                        agents: [],
                      },
                    },
                  },
                },
              },
            },
            '500': {
              description: '读花名册失败（罕见；空态不返回 500）',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorBody' },
                },
              },
            },
          },
        },
        post: {
          operationId: 'postCatalog',
          summary: '整表写入花名册并持久化',
          description: [
            'Body = 完整 CATALOG.json 对象，必须含 `workspaces` 数组（可为空数组）。',
            '成功：写入 ~/.pixel-office/catalog.json（或 PIXEL_OFFICE_HOME）、更新内存、presence retainIds。',
            '失败：400 且不改内存与磁盘。',
            '鉴权：若设了 EVO_PRESENCE_TOKEN，跨机 POST 需 Bearer；同源浏览器可免。未设则开放。',
            'Body 硬上限 2 MiB → 413。',
          ].join('\n'),
          security: [{}, { bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CatalogJsonBody' },
                examples: {
                  sample: {
                    value: {
                      wiki_index_version: '1',
                      generated_at: '2026-09-14T00:00:00Z',
                      workspaces: [
                        {
                          dirname: 'pixel-office',
                          title: '像素办公室 — 大屏',
                          lifecycle: 'active',
                          owns: ['runtime catalog'],
                          blurb: '',
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: '映射后的 CatalogPayload',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CatalogPayload' },
                },
              },
            },
            '400': {
              description: '校验失败（缺 workspaces / 非对象 / 非法 JSON）',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorBody' },
                },
              },
            },
            '401': {
              description: 'Bearer 鉴权失败（仅当 EVO_PRESENCE_TOKEN 已设）',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorBody' },
                },
              },
            },
            '413': {
              description: 'Body 超过 2 MiB',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorBody' },
                },
              },
            },
            '405': {
              description: '方法不允许',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorBody' },
                },
              },
            },
          },
        },
      },
      '/api/presence': {
        options: {
          operationId: 'optionsPresence',
          summary: 'CORS 预检',
          description: '放行 GET/POST；Allow-Headers 含 Content-Type、Authorization。',
          responses: {
            '204': { description: 'No Content' },
          },
        },
        get: {
          operationId: 'getPresence',
          summary: '全员有效出勤快照',
          description: [
            '按当前花名册 id 列表返回出勤（未报到者为隐式 idle，updatedAt=0）。',
            `读时合成 TTL：working ≥ ${WORKING_TTL_SEC}s → idle；blocked ≥ ${BLOCKED_TTL_SEC}s → idle。`,
          ].join(' '),
          responses: {
            '200': {
              description: 'PresenceSnapshot',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PresenceSnapshot' },
                  examples: {
                    sample: {
                      value: {
                        agents: [
                          {
                            id: 'pixel-office',
                            state: 'working',
                            summary: '改 openapi',
                            updatedAt: 1726300000000,
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          operationId: 'postPresence',
          summary: '报到 / 更新出勤',
          description: [
            'upsert 一条出勤。id 必须已在当前花名册；未知 id → 404。',
            'Agent 合同：开干 working；卡住或做完待验收 blocked；禁止刚做完直接 idle。',
            '鉴权：若设了 EVO_PRESENCE_TOKEN，跨机 POST 需 Bearer；同源浏览器（Origin 与 Host 一致）可免。未设 token 则不拦。',
          ].join('\n'),
          security: [{}, { bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PresenceUpsert' },
                examples: {
                  working: {
                    summary: '开干',
                    value: {
                      id: 'pixel-office',
                      state: 'working',
                      summary: '改 openapi',
                    },
                  },
                  blocked: {
                    summary: '做完待验收',
                    value: {
                      id: 'pixel-office',
                      state: 'blocked',
                      summary: '改完了，请验收',
                    },
                  },
                  idle: {
                    summary: '灭灯',
                    value: { id: 'pixel-office', state: 'idle' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: '规范化后的出勤记录',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PresenceRecord' },
                },
              },
            },
            '400': {
              description: '校验失败（缺 id / 非法 state / 非 JSON 等）',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorBody' },
                },
              },
            },
            '401': {
              description: 'Bearer 鉴权失败（仅当 EVO_PRESENCE_TOKEN 已设）',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorBody' },
                },
              },
            },
            '404': {
              description: 'id 不在当前花名册',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorBody' },
                },
              },
            },
            '405': {
              description: '方法不允许',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorBody' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description:
            '环境变量 EVO_PRESENCE_TOKEN。有值则跨机 POST /api/catalog 与 POST /api/presence 需 `Authorization: Bearer <token>`；同源大屏可免。未设则开放。',
        },
      },
      schemas: {
        ErrorBody: {
          type: 'object',
          required: ['error'],
          properties: {
            error: { type: 'string' },
          },
        },
        CatalogJsonBody: {
          type: 'object',
          required: ['workspaces'],
          description: '完整 CATALOG.json 形状；只映射 workspaces[]',
          properties: {
            wiki_index_version: { type: 'string' },
            generated_at: { type: 'string' },
            workspaces: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  dirname: { type: 'string' },
                  title: { type: 'string' },
                  lifecycle: { type: 'string' },
                  owns: { type: 'array', items: { type: 'string' } },
                  blurb: { type: 'string' },
                  not: { type: 'string' },
                  siblings: { type: 'array', items: { type: 'object' } },
                },
              },
            },
            unmanaged: {
              type: 'array',
              description: '不进办公室；可省略',
              items: { type: 'object' },
            },
          },
        },
        CatalogSibling: {
          type: 'object',
          required: ['project', 'relation'],
          properties: {
            project: { type: 'string' },
            relation: { type: 'string' },
            capability: { type: 'string' },
            reference: { type: 'string' },
          },
        },
        AgentPersona: {
          type: 'object',
          required: [
            'id',
            'name',
            'title',
            'status',
            'blurb',
            'lifecycle',
            'owns',
            'not',
            'siblings',
            'skin',
            'tint',
          ],
          properties: {
            id: {
              type: 'string',
              description: 'workspace dirname；与 POST /api/presence 的 id 对齐',
            },
            name: { type: 'string' },
            title: { type: 'string' },
            status: { type: 'string' },
            blurb: { type: 'string' },
            lifecycle: { type: 'string' },
            owns: { type: 'array', items: { type: 'string' } },
            not: { type: 'string' },
            siblings: {
              type: 'array',
              items: { $ref: '#/components/schemas/CatalogSibling' },
            },
            skin: { type: 'integer', minimum: 0 },
            tint: {
              type: 'integer',
              description: 'Deprecated for rendering; kept for payload stability',
            },
          },
        },
        CatalogPayload: {
          type: 'object',
          required: ['sourcePath', 'agents'],
          properties: {
            sourcePath: { type: 'string' },
            wiki_index_version: { type: 'string' },
            generated_at: { type: 'string' },
            agents: {
              type: 'array',
              items: { $ref: '#/components/schemas/AgentPersona' },
            },
          },
        },
        PresenceState: {
          type: 'string',
          enum: presenceStates,
          description: [
            '`working`=在干（绿）；`blocked`=需要老板——卡住或做完待验收（黄）；`idle`=灭灯（灰）。',
            `TTL：working ${WORKING_TTL_SEC}s；blocked ${BLOCKED_TTL_SEC}s。`,
          ].join(' '),
        },
        PresenceRecord: {
          type: 'object',
          required: ['id', 'state', 'summary', 'updatedAt'],
          properties: {
            id: { type: 'string' },
            state: { $ref: '#/components/schemas/PresenceState' },
            summary: {
              type: 'string',
              description: `最长 ${SUMMARY_MAX_CHARS} 字`,
            },
            updatedAt: {
              type: 'number',
              description:
                '服务器收到时间（ms）。0 = 从未报到（隐式 idle）。TTL 以此为准，不以客户端 ts 为准。',
            },
          },
        },
        PresenceSnapshot: {
          type: 'object',
          required: ['agents'],
          properties: {
            agents: {
              type: 'array',
              items: { $ref: '#/components/schemas/PresenceRecord' },
            },
          },
        },
        PresenceUpsert: {
          type: 'object',
          required: ['id', 'state'],
          properties: {
            id: {
              type: 'string',
              description: '必须已在当前花名册 agents[].id',
            },
            state: { $ref: '#/components/schemas/PresenceState' },
            summary: {
              type: 'string',
              description: `可选；trim 后最长 ${SUMMARY_MAX_CHARS} 字；空或缺省 = 不改已存 summary`,
            },
            ts: {
              type: 'string',
              description:
                'Reserved / ignored。PRD 曾提 RFC3339；实现未使用。TTL 以服务器 updatedAt 为准。',
            },
          },
        },
      },
    },
  }
}

/**
 * Serialize the document the same way gen:openapi and tests do.
 * @returns {string}
 */
export function serializeOpenApiDocument() {
  return `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @returns {boolean} true if handled
 */
export function handleOpenApi(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  if (url.pathname !== '/api/openapi.json') return false

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return true
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'method not allowed' }))
    return true
  }

  const body = serializeOpenApiDocument()
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'HEAD') {
    res.end()
  } else {
    res.end(body)
  }
  return true
}
