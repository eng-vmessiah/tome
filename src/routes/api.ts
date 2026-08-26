/**
 * API routes (JSON responses) — Phase 1: unified /api/read/:source/... (ADR-0002).
 */
import { json } from "../server";
import { getImageCache, setImageCache } from "../services/cache";
import { getSource } from "../services/source-registry";
import {
  createInvitation,
  getPendingInvitations,
  revokeInvitation,
  getInvitationExpiryDays,
} from "../services/invitations";
import { generateQRCode } from "../features/remote/sessions";

export async function handleApiRoute(
  req: Request,
  path: string,
  userId: string,
  isAdmin: boolean
): Promise<Response | null> {
  const method = req.method;

  // ============ Unified chapter API: GET chapter JSON, POST progress ============
  const readApiMatch = path.match(/^\/api\/read\/([\w-]+)\/([^/]+)\/([^/]+)$/);
  if (readApiMatch) {
    const [, sourceName, fictionRef, chapterRef] = readApiMatch;
    const source = getSource(userId, sourceName);
    if (!source) return json({ error: "Source not found or disabled" }, 404);

    if (method === "GET") {
      if (!source.getChapter) return json({ error: "Chapter not found" }, 404);
      try {
        // The GET is the reader's PRELOAD of the next chapter. Passing no userId
        // makes the source fetch anonymously, so Royal Road does NOT mark the
        // chapter read (RR records read state on an authenticated chapter GET).
        // Marking read happens only via the POST below (reportProgress) when the
        // user actually navigates to the chapter.
        const chapter = await source.getChapter(fictionRef, chapterRef);
        if (!chapter) return json({ error: "Chapter not found" }, 404);
        return json({
          ref: chapter.ref ?? chapterRef,
          title: chapter.title,
          content: chapter.content,
          fictionTitle: chapter.fictionTitle || null,
          fictionRef: chapter.fictionRef || fictionRef,
          prevRef: chapter.prevRef ?? null,
          nextRef: chapter.nextRef ?? null,
        });
      } catch (error: any) {
        console.error(`Error fetching chapter API ${sourceName}/${fictionRef}/${chapterRef}:`, error);
        return json({ error: error.message || "Failed to load chapter" }, 500);
      }
    }

    if (method === "POST") {
      if (!source.updateProgress) return json({ error: "Progress not supported" }, 404);
      try {
        const body = await req.json().catch(() => ({}));
        await source.updateProgress(userId, fictionRef, chapterRef, body);
        return json({ success: true });
      } catch (error: any) {
        console.error(`Error updating progress ${sourceName}/${fictionRef}/${chapterRef}:`, error);
        return json({ error: error.message || "Failed to update progress" }, 500);
      }
    }
  }

  // ============ Unified cover proxy: /api/cover/:source/:ref ============
  const coverMatch = path.match(/^\/api\/cover\/([\w-]+)\/([^/]+)$/);
  if (coverMatch && method === "GET") {
    const [, sourceName, ref] = coverMatch;
    const source = getSource(userId, sourceName);
    if (!source || !source.getFiction) {
      return new Response("Cover not found", { status: 404 });
    }

    const cacheKey = `cover:${sourceName}:${ref}`;
    const cached = getImageCache(cacheKey);
    if (cached) {
      return new Response(new Uint8Array(cached.data), {
        headers: {
          "Content-Type": cached.contentType,
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    try {
      const fiction = await source.getFiction(ref, userId);
      if (!fiction?.coverUrl) {
        return new Response("Cover not found", { status: 404 });
      }

      const imageResponse = await fetch(fiction.coverUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!imageResponse.ok) {
        return new Response("Failed to fetch cover", { status: 502 });
      }

      const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
      const imageData = Buffer.from(await imageResponse.arrayBuffer());

      setImageCache(cacheKey, imageData, contentType);

      return new Response(new Uint8Array(imageData), {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch (error: any) {
      console.error(`Error fetching cover for ${sourceName}/${ref}:`, error);
      return new Response("Error fetching cover", { status: 500 });
    }
  }

  // WebSocket diagnostic report
  if (path === "/api/ws-test/report" && method === "POST") {
    try {
      const report = await req.json();

      console.log("\n[WS-TEST] ═══════════════════════════════════════");
      console.log("[WS-TEST] DIAGNOSTIC REPORT");
      console.log("[WS-TEST] ═══════════════════════════════════════");
      console.log("[WS-TEST] User-Agent:", report.userAgent || "unknown");
      console.log("[WS-TEST] WebSocket API exists:", report.hasWebSocket);
      console.log("[WS-TEST] Connection attempted:", report.connectAttempted);
      console.log("[WS-TEST] Connection success:", report.connectSuccess);
      console.log("[WS-TEST] Message echo success:", report.messageSuccess);
      if (report.error) {
        console.log("[WS-TEST] Error:", report.error);
      }
      if (report.timing) {
        console.log("[WS-TEST] Connection time:", report.timing + "ms");
      }
      console.log("[WS-TEST] ═══════════════════════════════════════\n");

      return json({ received: true });
    } catch (e: any) {
      console.error("[WS-TEST] Failed to parse report:", e.message);
      return json({ error: "Invalid report format" }, 400);
    }
  }

  // ============ Invitations (untouched) ============

  if (path === "/api/invitations" && method === "GET") {
    if (!isAdmin) {
      return json({ error: "Admin access required" }, 403);
    }
    const invitations = getPendingInvitations();
    return json({ invitations, expiryDays: getInvitationExpiryDays() });
  }

  if (path === "/api/invitations" && method === "POST") {
    if (!isAdmin) {
      return json({ error: "Admin access required" }, 403);
    }

    try {
      const body = await req.json();
      const email = body.email?.trim();

      if (!email) {
        return json({ error: "Email is required" }, 400);
      }

      const invitation = createInvitation(email, userId);
      const protocol = req.headers.get("x-forwarded-proto") || "http";
      const host = req.headers.get("host") || "localhost:3000";
      const inviteUrl = `${protocol}://${host}/invite/${invitation.token}`;

      return json({
        invitation,
        inviteUrl,
        qrUrl: `/api/invitations/qr/${invitation.token}`,
      });
    } catch (error: any) {
      console.error("Error creating invitation:", error);
      return json({ error: error.message || "Failed to create invitation" }, 500);
    }
  }

  const revokeMatch = path.match(/^\/api\/invitations\/([a-f0-9-]+)$/);
  if (revokeMatch && method === "DELETE") {
    if (!isAdmin) {
      return json({ error: "Admin access required" }, 403);
    }

    const invitationId = revokeMatch[1];
    const revoked = revokeInvitation(invitationId);

    if (revoked) {
      return json({ success: true });
    } else {
      return json({ error: "Invitation not found or already used" }, 404);
    }
  }

  const inviteQrMatch = path.match(/^\/api\/invitations\/qr\/([a-z0-9]+)$/);
  if (inviteQrMatch && method === "GET") {
    const token = inviteQrMatch[1];
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("host") || "localhost:3000";
    const inviteUrl = `${protocol}://${host}/invite/${token}`;

    try {
      const qrBuffer = await generateQRCode(inviteUrl);
      return new Response(new Uint8Array(qrBuffer), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "no-store",
        },
      });
    } catch (e: any) {
      console.error("[INVITE] QR generation failed:", e.message);
      return new Response("QR generation failed", { status: 500 });
    }
  }

  return null;
}
