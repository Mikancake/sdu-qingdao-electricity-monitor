import { FormEvent, useState } from "react";
import { Megaphone, Pencil, Plus, Trash2 } from "lucide-react";

import type { Announcement, AnnouncementVisibility } from "../../lib/types";
import { formatDateTime } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input, Label } from "../ui/input";

interface AnnouncementsPanelProps {
  announcements: Announcement[];
  loading: boolean;
  saving: boolean;
  onCreate: (payload: {
    title: string;
    content: string;
    is_published: boolean;
    visibility: AnnouncementVisibility;
  }) => void;
  onUpdate: (
    id: number,
    payload: { title?: string; content?: string; is_published?: boolean; visibility?: AnnouncementVisibility }
  ) => void;
  onDelete: (id: number) => void;
}

const emptyDraft = { title: "", content: "", is_published: true, visibility: "users" as AnnouncementVisibility };

function VisibilityField({
  value,
  onChange
}: {
  value: AnnouncementVisibility;
  onChange: (value: AnnouncementVisibility) => void;
}) {
  return (
    <select
      aria-label="显示范围"
      className="app-input-motion h-10 w-full rounded-md border border-border bg-panel/60 px-3 text-sm text-foreground outline-none focus:border-primary"
      value={value}
      onChange={(event) => onChange(event.target.value as AnnouncementVisibility)}
    >
      <option value="users">仅登录用户可见（总览页底部）</option>
      <option value="public">所有人可见（含未登录的注册页）</option>
    </select>
  );
}

export function AnnouncementsPanel({ announcements, loading, saving, onCreate, onUpdate, onDelete }: AnnouncementsPanelProps) {
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState(emptyDraft);

  function startEditing(item: Announcement) {
    setEditingId(item.id);
    setEditDraft({ title: item.title, content: item.content, is_published: item.is_published, visibility: item.visibility });
  }

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.content.trim()) return;
    onCreate({ ...draft, title: draft.title.trim(), content: draft.content.trim() });
    setDraft(emptyDraft);
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editingId === null || !editDraft.title.trim() || !editDraft.content.trim()) return;
    onUpdate(editingId, { ...editDraft, title: editDraft.title.trim(), content: editDraft.content.trim() });
    setEditingId(null);
  }
  const publishedCount = announcements.filter((item) => item.is_published).length;
  const draftCount = announcements.length - publishedCount;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            <Megaphone size={14} />
            内容运营
          </div>
          <h1 className="text-xl font-semibold">公告管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            公告显示在页面底部，用户可以自行关闭；「所有人可见」的公告还会出现在未登录的登录/注册页。草稿不会对任何人可见。
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge tone="success">{publishedCount} 条已发布</Badge>
          <Badge tone="muted">{draftCount} 条草稿</Badge>
        </div>
      </div>

      <Card className="border-border bg-panel shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus size={16} />
            发布新公告
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submitCreate}>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="announcement-title">标题</Label>
                <span className="text-[11px] text-muted-foreground">{draft.title.length}/160</span>
              </div>
              <Input
                id="announcement-title"
                maxLength={160}
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="例如：系统维护通知"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="announcement-content">内容</Label>
                <span className="text-[11px] text-muted-foreground">{draft.content.length}/10000</span>
              </div>
              <textarea
                id="announcement-content"
                aria-label="公告内容"
                className="app-input-motion mt-1 min-h-32 w-full resize-y rounded-md border border-border bg-panel/60 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                maxLength={10000}
                value={draft.content}
                onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                placeholder="输入公告内容，支持换行。"
              />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">显示范围</div>
              <VisibilityField
                value={draft.visibility}
                onChange={(visibility) => setDraft({ ...draft, visibility })}
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={draft.is_published}
                  onChange={(event) => setDraft({ ...draft, is_published: event.target.checked })}
                />
                立即发布
              </label>
              <Button type="submit" disabled={saving || !draft.title.trim() || !draft.content.trim()}>
                <Megaphone size={16} />
                发布公告
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border bg-panel shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>公告列表</span>
            <span className="text-xs font-normal text-muted-foreground">{announcements.length} 条</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">正在读取公告……</div> : null}
          {!loading && announcements.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              <Megaphone className="mx-auto mb-2 text-muted-foreground/70" size={24} />
              还没有公告，发布第一条通知吧。
            </div>
          ) : null}
          {announcements.map((item) => (
            <div key={item.id} className="rounded-xl border border-border/70 bg-panel/35 p-4 transition hover:border-primary/30">
              {editingId === item.id ? (
                <form className="space-y-3" onSubmit={submitEdit}>
                  <Input
                    aria-label="公告标题"
                    value={editDraft.title}
                    maxLength={160}
                    onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })}
                  />
                  <textarea
                    aria-label="公告内容"
                    className="app-input-motion min-h-28 w-full resize-y rounded-md border border-border bg-panel/60 px-3 py-2 text-sm outline-none focus:border-primary"
                    maxLength={10000}
                    value={editDraft.content}
                    onChange={(event) => setEditDraft({ ...editDraft, content: event.target.value })}
                  />
                  <div>
                    <div className="mb-1 text-xs font-medium text-muted-foreground">显示范围</div>
                    <VisibilityField
                      value={editDraft.visibility}
                      onChange={(visibility) => setEditDraft({ ...editDraft, visibility })}
                    />
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={editDraft.is_published}
                        onChange={(event) => setEditDraft({ ...editDraft, is_published: event.target.checked })}
                      />
                      已发布
                    </label>
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={saving}>
                        保存
                      </Button>
                      <Button type="button" size="sm" variant="secondary" onClick={() => setEditingId(null)}>
                        取消
                      </Button>
                    </div>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{item.title}</h3>
                      <Badge tone={item.is_published ? "success" : "muted"}>{item.is_published ? "已发布" : "草稿"}</Badge>
                      <Badge tone={item.visibility === "public" ? "default" : "muted"}>
                        {item.visibility === "public" ? "所有人可见" : "登录后可见"}
                      </Badge>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{item.content}</p>
                    <div className="mt-3 text-xs text-muted-foreground">
                      {formatDateTime(item.published_at ?? item.created_at)}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button aria-label={`编辑公告：${item.title}`} size="icon" variant="secondary" title="编辑" onClick={() => startEditing(item)}>
                      <Pencil size={15} />
                    </Button>
                    <Button aria-label={`删除公告：${item.title}`} size="icon" variant="secondary" title="删除" onClick={() => onDelete(item.id)}>
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
