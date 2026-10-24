/**
 * components/workspace/Palettes/Comments.tsx
 *
 * WHAT   The Comments palette: threads with an unresolved-only filter. Add a comment (Ctrl+Enter or ⌘+Enter
 *        posts), @mention people, attach files, pin to the selected element, reply, resolve / reopen and view
 *        history.
 * FOR    Collaboration on the open project (project.comments in the workspace store). Mentions autocomplete
 *        from the members list in the app store.
 * DEBUG  - A comment is not pinned: pinning needs a selected element and the pin switch on.
 *        - The @ list does not appear: it shows only while the text ends with @ and letters, and matches member
 *          names without spaces.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { EmptyState, Pill } from "@/components/ui/controls";
import { useApp, useAppApi } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { cn, initials } from "@/lib/utils";
import { useScene } from "../hooks";

/* Comments: threads with an unresolved filter. Add · reply · @mention · attach · pin to model · resolve / reopen · history. */
export function Comments() {
  const ws = useWsApi();
  const appApi = useAppApi();
  const scene = useScene();
  const comments = useWs((s) => s.project.comments);
  const onlyOpen = useWs((s) => s.commentFilterUnresolved);
  const selection = useWs((s) => s.selection);
  const members = useApp((s) => s.members);
  const [text, setText] = useState("");
  const [pin, setPin] = useState(true);
  const [files, setFiles] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [history, setHistory] = useState<string | null>(null);

  const mention = /(?:^|\s)@(\w*)$/.exec(text);
  const suggestions = mention ? members.filter((m) => m.name.toLowerCase().replace(/\s/g, "").startsWith(mention[1].toLowerCase())).slice(0, 4) : [];
  const shown = comments.filter((c) => !onlyOpen || !c.resolved);
  const target = selection[0];

  const post = () => {
    const t = text.trim();
    if (!t) return;
    ws.getState().addComment(files.length ? `${t}\n📎 ${files.join(", ")}` : t, pin && target ? target : undefined);
    appApi.getState().toast("Comment added");
    setText("");
    setFiles([]);
  };

  return (
    <div data-testid="palette-comments">
      <div className="border-b border-soft p-2.5">
        <div className="relative">
          <textarea
            aria-label="New comment"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => (e.key === "Enter" && (e.metaKey || e.ctrlKey) ? post() : undefined)}
            placeholder="Add a comment. Use @ to mention someone…"
            rows={2}
            className="input h-auto resize-none py-1.5"
          />
          {suggestions.length > 0 && (
            <ul className="absolute left-0 top-full z-10 mt-0.5 w-full overflow-hidden rounded-md border border-line bg-chrome shadow-pop">
              {suggestions.map((m) => (
                <li key={m.id}>
                  <button className="flex w-full items-center gap-2 px-2 py-1 text-left text-[0.75rem] hover:bg-accent/15" onClick={() => setText(text.replace(/@\w*$/, `@${m.name.replace(/\s/g, "")} `))}>
                    <span className="grid size-5 place-items-center rounded-full bg-accent text-[0.5625rem] font-bold text-on-accent">{initials(m.name)}</span>
                    {m.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <label className={cn("flex cursor-pointer items-center gap-1.5 text-[0.6875rem]", target ? "text-t2" : "text-t3")}>
            <input type="checkbox" checked={pin && !!target} disabled={!target} onChange={(e) => setPin(e.target.checked)} className="accent-[var(--accent)]" />
            <Icon name="pin" size={11} />
            {target ? `Pin to ${target}` : "Pin to model (select an element)"}
          </label>
          <label className="ml-auto flex cursor-pointer items-center gap-1 text-[0.6875rem] text-t2 hover:text-t1">
            <Icon name="paperclip" size={12} />
            Attach
            <input
              type="file"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFiles((l) => [...l, f.name]);
                e.target.value = "";
              }}
            />
          </label>
          <button className="btn btn-primary h-6 px-3 text-[0.6875rem]" disabled={!text.trim()} onClick={post}>
            Comment
          </button>
        </div>
        {files.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {files.map((f) => (
              <span key={f} className="mono inline-flex items-center gap-1 rounded bg-t1/10 px-1.5 py-0.5 text-[0.625rem] text-t2">
                <Icon name="file" size={10} /> {f}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-b border-soft px-2.5 py-1.5">
        <span className="text-[0.6875rem] text-t3">
          {shown.length} thread{shown.length === 1 ? "" : "s"}
        </span>
        <label className="flex cursor-pointer items-center gap-1.5 text-[0.6875rem] text-t2">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => ws.getState().setCommentFilter(e.target.checked)} className="accent-[var(--accent)]" />
          Unresolved only
        </label>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon="comment" title={onlyOpen ? "No unresolved comments" : "No comments yet"} hint="Pin a comment to any element so your team sees it in the 3D model." />
      ) : (
        <ul>
          {shown.map((c) => (
            <li key={c.id} className={cn("border-b border-soft/70 px-2.5 py-2.5", c.resolved && "opacity-60")}>
              <div className="flex items-center gap-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent/80 text-[0.625rem] font-bold text-on-accent">{initials(c.author)}</span>
                <span className="text-[0.75rem] font-semibold text-t1">{c.author}</span>
                <span className="text-[0.6875rem] text-t3">{c.at}</span>
                {c.resolved && <Pill tone="ok" className="ml-auto">Resolved</Pill>}
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-[0.75rem] leading-snug text-t1">{c.text}</p>
              {(c.elementId || c.attachments.length > 0) && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {c.elementId && scene.elementById[c.elementId] && (
                    <button onClick={() => ws.getState().focusElements([c.elementId!])} className="mono inline-flex items-center gap-1 rounded border border-line px-1.5 py-px text-[0.625rem] text-accent hover:border-accent">
                      <Icon name="pin" size={10} /> {c.elementId}
                    </button>
                  )}
                  {c.attachments.map((a) => (
                    <span key={a} className="mono inline-flex items-center gap-1 rounded bg-t1/10 px-1.5 py-px text-[0.625rem] text-t2">
                      <Icon name="paperclip" size={10} /> {a}
                    </span>
                  ))}
                </div>
              )}
              {c.replies.map((r) => (
                <div key={r.id} className="ml-3 mt-2 border-l-2 border-line pl-2.5">
                  <div className="text-[0.6875rem]">
                    <b className="text-t1">{r.author}</b> <span className="text-t3">{r.at}</span>
                  </div>
                  <p className="text-[0.75rem] leading-snug text-t2">{r.text}</p>
                </div>
              ))}
              {replyTo === c.id ? (
                <div className="mt-2 flex gap-1.5">
                  <input autoFocus aria-label="Reply" className="input" value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && reply.trim()) { ws.getState().replyComment(c.id, reply.trim()); setReply(""); setReplyTo(null); } if (e.key === "Escape") setReplyTo(null); }} placeholder="Write a reply…" />
                  <button className="btn btn-primary h-7 px-2.5 text-[0.6875rem]" disabled={!reply.trim()} onClick={() => { ws.getState().replyComment(c.id, reply.trim()); setReply(""); setReplyTo(null); }}>
                    Send
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex gap-3 text-[0.6875rem]">
                  <button className="text-t2 hover:text-accent" onClick={() => setReplyTo(c.id)}>
                    Reply
                  </button>
                  <button className="text-t2 hover:text-accent" onClick={() => ws.getState().toggleResolveComment(c.id)}>
                    {c.resolved ? "Reopen" : "Resolve"}
                  </button>
                  <button className="text-t2 hover:text-accent" onClick={() => setHistory(history === c.id ? null : c.id)}>
                    History
                  </button>
                </div>
              )}
              {history === c.id && (
                <ul className="anim-fade mt-1.5 space-y-0.5 rounded bg-panel-alt px-2 py-1.5 text-[0.6875rem] text-t3">
                  {c.history.map((h, i) => (
                    <li key={i}>• {h}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
