'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  adminCharacterInput,
  adminPhotoInput,
  adminLevelsInput,
  type AdminCharacter,
  type AdminPhoto,
  type AdminLevelsInput,
  type AdminRole,
  type AdminAudit,
} from '@companion/shared';
import { adminClient, request } from '../lib/client';
type Tab = 'characters' | 'rules' | 'audit' | 'users';
type AdminUser = { id: string; firstSeenAt: string; availableDiamonds: number };
type Page<T> = { items: T[]; nextCursor: string | null };
const labels: Record<Tab, string> = {
  characters: '角色管理',
  rules: '成长规则',
  audit: '操作记录',
  users: '用户管理',
};
const apiHint = '后台尚未连接时，请先部署 API、新增迁移并授权管理员。';
function errorText(e: unknown) {
  return e instanceof Error ? e.message : '操作失败，请重试';
}
function Asset({ path, token }: { path: string; token: string }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setUrl('');
    setFailed(false);
    request<{ url: string }>(token, 'preview', { path })
      .then((x) => {
        if (active) setUrl(x.url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [path, token]);
  return (
    <div className="asset">
      {url && !failed ? (
        <img src={url} alt="内容素材预览" onError={() => setFailed(true)} />
      ) : (
        <span>{failed ? '预览暂不可用' : '加载预览…'}</span>
      )}
    </div>
  );
}

function ImageUploader({
  path,
  token,
  disabled,
  label,
  upload,
  onChange,
}: {
  path: string | null;
  token: string;
  disabled: boolean;
  label: string;
  upload: (file: File) => Promise<string>;
  onChange: (path: string | null, file?: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const currentPath = useRef(path);
  const [preview, setPreview] = useState(''),
    [working, setWorking] = useState(false),
    [dragging, setDragging] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (path !== currentPath.current) {
      setPreview('');
      currentPath.current = path;
      setError('');
    }
  }, [path]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  async function choose(file?: File) {
    if (!file || disabled || working) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('请选择 JPEG、PNG 或 WebP 图片');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('图片不能超过 8 MB');
      return;
    }
    setPreview(URL.createObjectURL(file));
    setWorking(true);
    try {
      const next = await upload(file);
      currentPath.current = next;
      onChange(next, file);
    } catch (e) {
      setPreview('');
      setError(errorText(e));
    } finally {
      setWorking(false);
    }
  }
  return (
    <div className="image-uploader">
      <input
        ref={input}
        className="file-input"
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled || working}
        aria-label={label}
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <div
        className={`upload-tile ${path || preview ? 'has-image' : ''} ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !working) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void choose(e.dataTransfer.files[0]);
        }}
      >
        <button
          type="button"
          className="upload-target"
          disabled={disabled || working}
          aria-label={path ? `更换${label}` : `上传${label}`}
          onClick={() => input.current?.click()}
        >
          {preview ? (
            <img src={preview} alt={`${label}预览`} />
          ) : path ? (
            <Asset path={path} token={token} />
          ) : (
            <span className="upload-placeholder">
              <span className="upload-plus">＋</span>
              <strong>上传{label}</strong>
              <span>点击选择或拖入图片</span>
            </span>
          )}
          {(path || preview) && (
            <span className="replace-overlay">点击更换图片</span>
          )}
          {working && (
            <span className="upload-progress" role="status">
              上传中…
            </span>
          )}
        </button>
        {(path || preview) && !disabled && !working && (
          <button
            type="button"
            className="upload-clear"
            aria-label={`移除${label}`}
            title="移除图片"
            onClick={() => onChange(null)}
          >
            ×
          </button>
        )}
      </div>
      <span className="upload-hint">
        {label === '封面' ? '建议 9:16' : '建议 4:5 · 1600 × 2000 px'} · 最大 8
        MB
      </span>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default function Home() {
  const [client] = useState(adminClient),
    [token, setToken] = useState(''),
    [role, setRole] = useState<AdminRole | null>(null),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [failure, setFailure] = useState('');
  const [tab, setTab] = useState<Tab>('characters'),
    [characters, setCharacters] = useState<AdminCharacter[]>([]),
    [charactersLoading, setCharactersLoading] = useState(false),
    [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState<AdminCharacter | null>(null),
    [photos, setPhotos] = useState<AdminPhoto[]>([]),
    [photosLoading, setPhotosLoading] = useState(false),
    [photosError, setPhotosError] = useState(''),
    [photosOwner, setPhotosOwner] = useState<string | null>(null),
    [photosReload, setPhotosReload] = useState(0),
    [assetUploading, setAssetUploading] = useState(false),
    [levels, setLevels] = useState<AdminLevelsInput | null>(null),
    [audit, setAudit] = useState<AdminAudit[]>([]),
    [auditCursor, setAuditCursor] = useState<string | null>(null),
    [search, setSearch] = useState(''),
    [appliedSearch, setAppliedSearch] = useState(''),
    [users, setUsers] = useState<AdminUser[]>([]),
    [usersCursor, setUsersCursor] = useState<string | null>(null),
    [usersLoading, setUsersLoading] = useState(false),
    [usersError, setUsersError] = useState(''),
    [version, setVersion] = useState(0),
    [ready, setReady] = useState(false);
  const mounted = useRef(true);
  const uploadLock = useRef(false);
  const characterRequest = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!client) return;
    const sub = client.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token ?? '');
      if (!session) {
        setRole(null);
        setCharacters([]);
        setSelected(null);
        setPhotos([]);
        setLevels(null);
        setAudit([]);
        setUsers([]);
        setUsersCursor(null);
        setReady(false);
      }
    });
    return () => sub.data.subscription.unsubscribe();
  }, [client]);
  useEffect(() => {
    const timer = setTimeout(() => setAppliedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const loadCharacters = useCallback(
    async (next?: string) => {
      const generation = ++characterRequest.current;
      const params = new URLSearchParams();
      if (next) params.set('before', next);
      if (appliedSearch) params.set('search', appliedSearch);
      const d = await request<Page<AdminCharacter>>(
        token,
        `characters?${params}`,
      );
      if (mounted.current && characterRequest.current === generation) {
        setCharacters((old) => (next ? [...old, ...d.items] : d.items));
        setCursor(d.nextCursor);
      }
    },
    [token, appliedSearch],
  );
  useEffect(() => {
    if (!token) return;
    let active = true;
    setReady(false);
    setFailure('');
    request<{ role: AdminRole }>(token, 'me')
      .then((me) => {
        if (!active) return;
        setRole(me.role);
        setReady(true);
      })
      .catch((e) => {
        if (active) setFailure(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [token, version]);
  useEffect(() => {
    if (!token || !ready) return;
    let active = true;
    setCharactersLoading(true);
    loadCharacters()
      .catch((e) => {
        if (active) setFailure(errorText(e));
      })
      .finally(() => {
        if (active) setCharactersLoading(false);
      });
    return () => {
      active = false;
      characterRequest.current++;
    };
  }, [token, ready, loadCharacters]);
  useEffect(() => {
    if (!token || !role || !ready) return;
    let active = true;
    setFailure('');
    setLevels(null);
    if (tab === 'rules' && selected)
      request<AdminLevelsInput>(token, `levels?characterId=${selected.id}`)
        .then((d) => {
          if (active) setLevels(d);
        })
        .catch((e) => {
          if (active) setFailure(errorText(e));
        });
    if (tab === 'audit')
      request<Page<AdminAudit>>(token, 'audit')
        .then((d) => {
          if (active) {
            setAudit(d.items);
            setAuditCursor(d.nextCursor);
          }
        })
        .catch((e) => {
          if (active) setFailure(errorText(e));
        });
    return () => {
      active = false;
    };
  }, [tab, selected, token, role, ready]);
  useEffect(() => {
    let active = true;
    setPhotos([]);
    setPhotosError('');
    setPhotosOwner(null);
    setPhotosLoading(false);
    if (
      !token ||
      !role ||
      !ready ||
      tab !== 'characters' ||
      !selected?.created_at
    )
      return;
    setPhotosLoading(true);
    request<{ items: AdminPhoto[] }>(token, `photos?characterId=${selected.id}`)
      .then((d) => {
        if (active) {
          setPhotos(d.items);
          setPhotosOwner(selected.id);
        }
      })
      .catch((e) => {
        if (active) setPhotosError(errorText(e));
      })
      .finally(() => {
        if (active) setPhotosLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    token,
    role,
    ready,
    tab,
    selected?.id,
    selected?.created_at,
    photosReload,
  ]);
  useEffect(() => {
    let active = true;
    setUsers([]);
    setUsersCursor(null);
    setUsersError('');
    if (tab !== 'users' || !token || role !== 'admin' || !ready) return;
    setUsersLoading(true);
    request<Page<AdminUser>>(token, 'users')
      .then((data) => {
        if (active) {
          setUsers(data.items);
          setUsersCursor(data.nextCursor);
        }
      })
      .catch((e) => {
        if (active) setUsersError(errorText(e));
      })
      .finally(() => {
        if (active) setUsersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab, token, role, ready]);
  const visibleCharacters = characters;
  async function act(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    setFailure('');
    try {
      await task();
    } catch (e) {
      setFailure(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function login(e: React.FormEvent) {
    e.preventDefault();
    await act(async () => {
      if (!client) throw new Error('网站公开连接配置尚未填写');
      const result = await client.auth.signInWithPassword({ email, password });
      setPassword('');
      if (result.error) throw new Error('登录未成功，请检查账号、密码和网络');
    });
  }
  async function upload(file: File) {
    if (!client) throw new Error('连接未配置');
    if (file.size > 8 * 1024 * 1024) throw new Error('图片须小于 8 MB');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      throw new Error('仅支持 JPEG、PNG、WebP');
    if (uploadLock.current) throw new Error('请等待当前上传完成');
    uploadLock.current = true;
    setAssetUploading(true);
    try {
      const grant = await request<{
        path: string;
        token: string;
        bucket: string;
      }>(token, 'uploads', { contentType: file.type });
      const r = await client.storage
        .from(grant.bucket)
        .uploadToSignedUrl(grant.path, grant.token, file, {
          contentType: file.type,
        });
      if (r.error) throw new Error('上传失败，请重试');
      return grant.path;
    } finally {
      uploadLock.current = false;
      setAssetUploading(false);
    }
  }
  const editable = role === 'editor' || role === 'admin',
    publisher = role === 'admin';
  if (!token)
    return (
      <main className="login">
        <div className="brand">
          Tempta
          <span className="brand-label">管理后台</span>
        </div>
        <section className="login-card">
          <h1>管理员登录</h1>
          <form onSubmit={login}>
            <label>
              管理员邮箱
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label>
              密码
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {failure && (
              <p className="error" role="alert">
                {failure}
              </p>
            )}
            {!client && (
              <p className="error">网站连接配置尚未完成，请联系管理员。</p>
            )}
            <button className="primary" disabled={busy || !client}>
              {busy ? '正在登录…' : '登录'}
            </button>
          </form>
        </section>
      </main>
    );
  return (
    <div className="workspace">
      <aside className="sidebar">
        <a className="brand" href="#">
          Tempta
        </a>
        <div className="environment">
          <span />
          内测环境
        </div>
        <nav>
          {(Object.keys(labels) as Tab[])
            .filter((x) => x !== 'users' || role === 'admin')
            .map((x) => (
              <button
                key={x}
                className={tab === x ? 'active' : ''}
                onClick={() => {
                  setTab(x);
                  setMessage('');
                }}
              >
                {labels[x]}
              </button>
            ))}
        </nav>
        <div className="account">
          <div className="avatar">{email.slice(0, 1).toUpperCase() || 'A'}</div>
          <div>
            <strong>
              {role
                ? { viewer: '只读成员', editor: '内容编辑', admin: '管理员' }[
                    role
                  ]
                : '验证权限中'}
            </strong>
            <small>{email}</small>
          </div>
          <button
            aria-label="退出登录"
            title="退出登录"
            onClick={() => void client?.auth.signOut()}
          >
            退出
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="page-content">
          <div className="page-heading">
            <div>
              <h1>{labels[tab]}</h1>
            </div>
            <div className="heading-actions">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setSelected(null);
                  setVersion((x) => x + 1);
                }}
              >
                ↻ 刷新
              </button>
              {tab === 'characters' && editable && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    setSelected({
                      id: crypto.randomUUID(),
                      revision: 0,
                      name: '',
                      archetype: '',
                      bio: '',
                      tags: [],
                      system_prompt: '',
                      cover_object_key: null,
                      published: false,
                      created_at: '',
                    })
                  }
                >
                  ＋ 新建角色
                </button>
              )}
            </div>
          </div>
          {failure && (
            <div className="notice error" role="alert">
              {failure}
              {!ready && <small>{apiHint}</small>}
            </div>
          )}
          {message && (
            <div className="notice success" role="status">
              {message}
            </div>
          )}
          {!ready ? (
            <div className="empty">
              <h2>{failure ? '加载失败' : '加载中…'}</h2>
              <p>{failure ? '请检查权限或连接后重试。' : ''}</p>
            </div>
          ) : (
            <>
              {tab === 'characters' && (
                <>
                  <section className="panel">
                    <div className="panel-header">
                      <h2>
                        角色库{' '}
                        <span className="count">{characters.length}</span>
                      </h2>
                      <input
                        className="character-search"
                        type="search"
                        aria-label="搜索角色"
                        placeholder="搜索角色名称"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    {charactersLoading ? (
                      <div className="empty">加载角色…</div>
                    ) : characters.length === 0 ? (
                      <div className="empty">
                        <h3>{appliedSearch ? '没有匹配的角色' : '暂无角色'}</h3>
                        {!appliedSearch && <p>点击“新建角色”添加。</p>}
                      </div>
                    ) : (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>角色</th>
                              <th>标签</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {visibleCharacters.length === 0 && (
                              <tr>
                                <td colSpan={3}>没有匹配的角色</td>
                              </tr>
                            )}
                            {visibleCharacters.map((c) => (
                              <tr key={c.id}>
                                <td>
                                  <div className="character-name">
                                    <span className="initial">
                                      {c.cover_object_key ? (
                                        <Asset
                                          path={c.cover_object_key}
                                          token={token}
                                        />
                                      ) : (
                                        c.name.slice(0, 1)
                                      )}
                                    </span>
                                    <div>
                                      <strong>{c.name}</strong>
                                      <small>{c.archetype}</small>
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  {c.tags.slice(0, 3).map((t) => (
                                    <span key={t} className="tag">
                                      {t}
                                    </span>
                                  ))}
                                </td>
                                <td>
                                  <button
                                    className="text-button"
                                    onClick={() => setSelected(c)}
                                  >
                                    {editable ? '编辑' : '查看'} ↗
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {cursor && (
                      <button
                        className="load-more"
                        disabled={busy}
                        onClick={() => void act(() => loadCharacters(cursor))}
                      >
                        载入更多角色
                      </button>
                    )}
                  </section>
                </>
              )}
              {tab === 'users' && role === 'admin' && (
                <section className="panel">
                  <div className="panel-header">
                    <h2>用户列表</h2>
                    <small>首次进入时间 · 北京时间</small>
                  </div>
                  {usersError && (
                    <p className="notice error" role="alert">
                      {usersError}
                    </p>
                  )}
                  {usersLoading && users.length === 0 ? (
                    <div className="empty">加载中…</div>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>用户 ID</th>
                            <th>首次进入时间</th>
                            <th>当前钻石</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.map((user) => (
                            <tr key={user.id}>
                              <td>
                                <code>{user.id}</code>
                              </td>
                              <td>
                                {new Date(user.firstSeenAt).toLocaleString(
                                  'zh-CN',
                                  { timeZone: 'Asia/Shanghai', hour12: false },
                                )}
                              </td>
                              <td>
                                {user.availableDiamonds.toLocaleString('zh-CN')}
                              </td>
                            </tr>
                          ))}
                          {!users.length && !usersError && (
                            <tr>
                              <td colSpan={3}>暂无用户</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {usersCursor && (
                    <button
                      className="secondary load-more"
                      disabled={usersLoading}
                      onClick={async () => {
                        setUsersLoading(true);
                        setUsersError('');
                        try {
                          const data = await request<Page<AdminUser>>(
                            token,
                            `users?before=${usersCursor}`,
                          );
                          setUsers((old) => [...old, ...data.items]);
                          setUsersCursor(data.nextCursor);
                        } catch (e) {
                          setUsersError(errorText(e));
                        } finally {
                          setUsersLoading(false);
                        }
                      }}
                    >
                      {usersLoading ? '加载中…' : '加载更多'}
                    </button>
                  )}
                </section>
              )}
              {tab === 'rules' && (
                <div className="selector">
                  <label>
                    当前角色
                    <select
                      value={selected?.id ?? ''}
                      onChange={(e) =>
                        setSelected(
                          characters.find((c) => c.id === e.target.value) ??
                            null,
                        )
                      }
                    >
                      <option value="">请选择角色</option>
                      {characters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {cursor && (
                    <button
                      className="text-button"
                      onClick={() => void act(() => loadCharacters(cursor))}
                    >
                      载入更多角色
                    </button>
                  )}
                </div>
              )}
              {tab === 'rules' &&
                (selected && levels ? (
                  <Rules
                    key={selected.id + levels.revision}
                    value={levels}
                    disabled={!publisher || busy}
                    save={(value) =>
                      act(async () => {
                        await request(token, 'levels', value);
                        setLevels(
                          await request(
                            token,
                            `levels?characterId=${selected.id}`,
                          ),
                        );
                        setMessage('成长规则已保存；已获得的等级和权限保留');
                      })
                    }
                  />
                ) : (
                  <div className="empty">
                    <h2>{selected ? '正在读取规则' : '请选择角色'}</h2>
                  </div>
                ))}
              {tab === 'audit' && (
                <section className="panel">
                  <div className="panel-header">
                    <h2>最近操作</h2>
                  </div>
                  {audit.length === 0 ? (
                    <div className="empty">
                      <h3>尚无内容变更记录</h3>
                    </div>
                  ) : (
                    audit.map((a) => (
                      <details className="audit-item" key={a.id}>
                        <summary>
                          <span className="audit-dot" />
                          <strong>{a.action}</strong>
                          <span className="mono">
                            {a.target_id.slice(0, 8)}
                          </span>
                          <time>
                            {new Date(a.created_at).toLocaleString('zh-CN')}
                          </time>
                        </summary>
                        <p className="muted">操作者：{a.actor_id}</p>
                        <div className="diff">
                          <div>
                            <h4>修改前</h4>
                            <pre>{JSON.stringify(a.before_data, null, 2)}</pre>
                          </div>
                          <div>
                            <h4>修改后</h4>
                            <pre>{JSON.stringify(a.after_data, null, 2)}</pre>
                          </div>
                        </div>
                      </details>
                    ))
                  )}
                  {auditCursor && (
                    <button
                      className="load-more"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          const d = await request<Page<AdminAudit>>(
                            token,
                            `audit?before=${auditCursor}`,
                          );
                          setAudit((old) => [...old, ...d.items]);
                          setAuditCursor(d.nextCursor);
                        })
                      }
                    >
                      载入更早记录
                    </button>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </main>
      {tab === 'characters' && selected && (
        <CharacterEditor
          key={selected.id}
          value={selected}
          existing={Boolean(selected.created_at)}
          {...{ token, editable, publisher, upload, failure, message }}
          busy={busy || assetUploading}
          photosSection={
            !selected.created_at ? (
              <p className="fine">保存角色后可添加照片。</p>
            ) : photosLoading ? (
              <p className="fine" role="status">
                正在加载照片…
              </p>
            ) : photosError ? (
              <div className="notice error" role="alert">
                {photosError}
                <button
                  className="text-button"
                  disabled={busy || assetUploading}
                  onClick={() => setPhotosReload((x) => x + 1)}
                >
                  重试
                </button>
              </div>
            ) : photosOwner !== selected.id ? (
              <p className="fine" role="status">
                正在加载照片…
              </p>
            ) : (
              <PhotoManager
                key={
                  selected.id +
                  photos.map((p) => p.id + ':' + p.revision).join(',')
                }
                photos={photos}
                character={selected}
                token={token}
                busy={busy || assetUploading}
                {...{ publisher, editable, upload }}
                save={(p) =>
                  act(async () => {
                    await request(token, 'photos', p);
                    const d = await request<{ items: AdminPhoto[] }>(
                      token,
                      `photos?characterId=${selected.id}`,
                    );
                    setPhotos(d.items);
                    setMessage('照片已保存');
                  })
                }
              />
            )
          }
          close={() => setSelected(null)}
          save={(value) =>
            act(async () => {
              const saved = await request<AdminCharacter>(
                token,
                'characters',
                value,
              );
              setSelected(saved);
              await loadCharacters();
              setMessage(publisher ? '已保存' : '已保存，等待管理员发布');
            })
          }
        />
      )}
    </div>
  );
}
function CharacterEditor({
  value,
  existing,
  token,
  busy,
  editable,
  publisher,
  upload,
  close,
  save,
  photosSection,
  failure,
  message,
}: {
  value: AdminCharacter;
  existing: boolean;
  photosSection: React.ReactNode;
  failure: string;
  message: string;
  token: string;
  busy: boolean;
  editable: boolean;
  publisher: boolean;
  upload: (f: File) => Promise<string>;
  close: () => void;
  save: (v: unknown) => Promise<void>;
}) {
  const [draft, setDraft] = useState({
      ...value,
      revision: existing ? value.revision : null,
    }),
    [tags, setTags] = useState(value.tags.join(', ')),
    [localError, setLocalError] = useState('');
  useEffect(() => {
    setDraft({ ...value, revision: existing ? value.revision : null });
    setTags(value.tags.join(', '));
    setLocalError('');
  }, [value, existing]);
  function field(key: string, v: unknown) {
    setDraft((d) => ({ ...d, [key]: v }));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { created_at: _, coverUrl: __, ...input } = draft;
    void _;
    void __;
    const parsed = adminCharacterInput.safeParse({
      ...input,
      tags: tags
        .split(/[,，]/)
        .map((x) => x.trim())
        .filter(Boolean),
      published: publisher,
    });
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? '配置不完整');
      return;
    }
    await save(parsed.data);
  }
  return (
    <div className="overlay">
      <section
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-title"
      >
        <div className="drawer-header">
          <div>
            <h2 id="editor-title">{existing ? '编辑角色' : '创建新角色'}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="关闭"
            disabled={busy}
            onClick={close}
          >
            ×
          </button>
          {failure && (
            <div className="notice error" role="alert">
              {failure}
            </div>
          )}
          {message && (
            <div className="notice success" role="status">
              {message}
            </div>
          )}
        </div>
        <form onSubmit={submit}>
          <fieldset disabled={!editable || busy}>
            <div className="character-layout">
              <div className="character-fields">
                <div className="form-row">
                  <label>
                    角色名称
                    <input
                      value={draft.name}
                      maxLength={64}
                      required
                      onChange={(e) => field('name', e.target.value)}
                    />
                  </label>
                  <label>
                    角色定位
                    <input
                      value={draft.archetype}
                      maxLength={64}
                      required
                      onChange={(e) => field('archetype', e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  角色简介
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={draft.bio}
                    onChange={(e) => field('bio', e.target.value)}
                  />
                </label>
                <label>
                  标签
                  <input
                    value={tags}
                    placeholder="用逗号分隔"
                    onChange={(e) => setTags(e.target.value)}
                  />
                </label>
                <label>
                  人设提示词
                  <textarea
                    rows={6}
                    maxLength={8000}
                    required={publisher}
                    value={draft.system_prompt}
                    onChange={(e) => field('system_prompt', e.target.value)}
                  />
                </label>
              </div>
              <div className="character-cover">
                <label>角色封面</label>
                <ImageUploader
                  path={draft.cover_object_key}
                  token={token}
                  disabled={!editable || busy}
                  label="封面"
                  upload={upload}
                  onChange={(path) => field('cover_object_key', path)}
                />
              </div>
            </div>
          </fieldset>
          {localError && (
            <p className="error" role="alert">
              {localError}
            </p>
          )}
          <div className="drawer-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={close}
            >
              关闭
            </button>
            {editable && (
              <button className="primary" disabled={busy}>
                {busy ? '保存中…' : '保存更新'}
              </button>
            )}
          </div>
        </form>
        <section className="character-photos" aria-label="角色照片">
          {photosSection}
        </section>
      </section>
    </div>
  );
}
function PhotoManager({
  photos,
  character,
  token,
  busy,
  publisher,
  editable,
  upload,
  save,
}: {
  photos: AdminPhoto[];
  character: AdminCharacter;
  token: string;
  busy: boolean;
  publisher: boolean;
  editable: boolean;
  upload: (f: File) => Promise<string>;
  save: (p: unknown) => Promise<void>;
}) {
  const [selected, setSelected] = useState<AdminPhoto | null>(null),
    [editorOpen, setEditorOpen] = useState(false),
    [localError, setLocalError] = useState('');
  const [draft, setDraft] = useState({
    id: crypto.randomUUID(),
    revision: null as number | null,
    character_id: character.id,
    title: 'PHOTO',
    kind: 'level' as 'level' | 'diamond',
    required_level: 1 as number | null,
    diamond_price: null as number | null,
    object_key: '',
    review_status: 'draft' as 'draft' | 'approved' | 'rejected',
    published: false,
  });
  function field(key: string, v: unknown) {
    setDraft((d) => ({ ...d, [key]: v }));
  }
  function edit(p: AdminPhoto) {
    setSelected(p);
    setEditorOpen(true);
    const { created_at: _, ...input } = p;
    void _;
    setDraft(input);
    setLocalError('');
  }
  function startNew() {
    setSelected(null);
    setEditorOpen(true);
    setLocalError('');
    setDraft({
      id: crypto.randomUUID(),
      revision: null,
      character_id: character.id,
      title: 'PHOTO',
      kind: 'level',
      required_level: 1,
      diamond_price: null,
      object_key: '',
      review_status: 'draft',
      published: false,
    });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = adminPhotoInput.safeParse({
      ...draft,
      title: draft.title.trim() || 'PHOTO',
      published: publisher,
      review_status: publisher ? 'approved' : 'draft',
    });
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? '配置不完整');
      return;
    }
    await save(parsed.data);
  }
  return (
    <div
      className={`split-layout photo-workspace ${editorOpen ? 'has-editor' : ''}`}
    >
      <section className="panel">
        <div className="panel-header">
          <h2>
            角色照片 <span className="count">{photos.length}</span>
          </h2>
          <small>最多显示最新 200 项</small>
        </div>
        <div className="photo-grid">
          {editable && (
            <button
              type="button"
              className="photo-add"
              disabled={busy}
              onClick={startNew}
            >
              <span>＋</span>
              <strong>添加照片</strong>
            </button>
          )}
          {!editable && photos.length === 0 && <p className="fine">暂无照片</p>}
          {photos.map((p) => (
            <button
              className={`photo-card ${selected?.id === p.id ? 'chosen' : ''}`}
              key={p.id}
              disabled={busy}
              onClick={() => edit(p)}
            >
              <Asset path={p.object_key} token={token} />
              <strong>{p.kind === 'level' ? '等级奖励' : '钻石照片'}</strong>
              <span>
                {p.kind === 'level'
                  ? `等级 ${p.required_level}`
                  : `${p.diamond_price ?? '未定价'} 钻石`}
              </span>
            </button>
          ))}
        </div>
      </section>
      {editorOpen && (
        <section className="panel edit-panel">
          <div className="photo-editor-heading">
            <h2>{selected ? '编辑照片' : '添加照片'}</h2>
            <button
              className="icon-button"
              type="button"
              aria-label="关闭照片编辑"
              disabled={busy}
              onClick={() => setEditorOpen(false)}
            >
              ×
            </button>
          </div>
          <form onSubmit={submit}>
            <fieldset disabled={!editable || busy}>
              <ImageUploader
                path={draft.object_key || null}
                token={token}
                disabled={!editable || busy}
                label="照片"
                upload={upload}
                onChange={(path) => {
                  setLocalError('');
                  setDraft((d) => ({
                    ...d,
                    object_key: path ?? '',
                    title: d.title || 'PHOTO',
                  }));
                }}
              />
              <label>
                解锁方式
                <select
                  value={draft.kind}
                  onChange={(e) => {
                    const kind = e.target.value as 'level' | 'diamond';
                    setDraft((d) => ({
                      ...d,
                      kind,
                      required_level: kind === 'level' ? 1 : null,
                      diamond_price: null,
                    }));
                  }}
                >
                  <option value="level">等级奖励</option>
                  <option value="diamond">钻石解锁</option>
                </select>
              </label>
              {draft.kind === 'level' ? (
                <label>
                  所需等级
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={draft.required_level ?? ''}
                    required
                    onChange={(e) =>
                      field('required_level', Number(e.target.value))
                    }
                  />
                </label>
              ) : (
                <label>
                  所需钻石
                  {!publisher && (
                    <span className="label-help">可留空保存草稿</span>
                  )}
                  <input
                    type="number"
                    min={1}
                    max={1000000000}
                    required={publisher}
                    value={draft.diamond_price ?? ''}
                    onChange={(e) =>
                      field(
                        'diamond_price',
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                  />
                </label>
              )}
            </fieldset>
            <p className="fine">
              更换图片后所有用户统一更新，已解锁权限保持不变。
            </p>
            {localError && <p className="error">{localError}</p>}
            {editable && (
              <button className="primary" disabled={busy}>
                {busy ? '保存中…' : publisher ? '保存使用' : '保存草稿'}
              </button>
            )}
          </form>
        </section>
      )}
    </div>
  );
}
function Rules({
  value,
  disabled,
  save,
}: {
  value: AdminLevelsInput;
  disabled: boolean;
  save: (v: unknown) => Promise<void>;
}) {
  const [rules, setRules] = useState(value.rules),
    [failure, setFailure] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = adminLevelsInput.safeParse({ ...value, rules });
    if (!parsed.success) {
      setFailure(parsed.error.issues[0]?.message ?? '配置无效');
      return;
    }
    await save(parsed.data);
  }
  return (
    <section className="panel rules-panel">
      <div className="panel-header">
        <h2>聊天成长门槛</h2>
        <span className="muted">审核通过且保存成功的回合计一次</span>
      </div>
      <form onSubmit={submit}>
        <fieldset disabled={disabled}>
          <div className="rule-head">
            <span>等级</span>
            <span>累计有效回合</span>
          </div>
          {rules.map((r, i) => (
            <div className="rule-row" key={r.level}>
              <span>
                <b>Lv. {r.level}</b>
                {i === 0 && <small>初始等级</small>}
              </span>
              <input
                aria-label={`等级 ${r.level} 累计回合`}
                type="number"
                min={i === 0 ? 0 : 1}
                max={2147483647}
                disabled={i === 0}
                value={r.requiredCount}
                onChange={(e) =>
                  setRules((old) =>
                    old.map((x, j) =>
                      i === j
                        ? { ...x, requiredCount: Number(e.target.value) }
                        : x,
                    ),
                  )
                }
              />
            </div>
          ))}
          <div className="rule-tools">
            <button
              type="button"
              className="secondary"
              disabled={rules.length >= 1000}
              onClick={() => {
                setFailure('请填写新增等级的正式门槛');
                setRules((old) => [
                  ...old,
                  { level: old.length + 1, requiredCount: 0 },
                ]);
              }}
            >
              ＋ 添加等级
            </button>
            <button
              type="button"
              className="text-button"
              disabled={rules.length <= 1}
              onClick={() => setRules((old) => old.slice(0, -1))}
            >
              移除末级
            </button>
          </div>
          <p className="fine">门槛须递增；已获得的等级和照片权限保留。</p>
          {failure && <p className="error">{failure}</p>}
          <button className="primary">保存成长规则</button>
        </fieldset>
      </form>
    </section>
  );
}
