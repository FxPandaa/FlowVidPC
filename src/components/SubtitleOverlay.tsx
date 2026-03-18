import { useState, useEffect, useRef } from "react";
import "./SubtitleOverlay.css";

interface SubtitleCue {
  startTime: number;
  endTime: number;
  text: string;
}

interface SubtitleOverlayProps {
  subtitleUrl: string | null;
  currentTime: number;
  isVisible: boolean;
  fontSize: number;
  fontFamily: string;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  textShadow: boolean;
  lineHeight: number;
  bottomPosition: number;
}

function parseVTT(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const lines = content.split(/\r?\n/);
  let i = 0;

  // Skip header
  while (i < lines.length && !lines[i].includes("-->")) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i];

    // Look for timing line
    if (line.includes("-->")) {
      const match = line.match(
        /(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})/,
      );
      if (match) {
        const startTime = parseTime(match[1]);
        const endTime = parseTime(match[2]);

        // Collect text lines
        const textLines: string[] = [];
        i++;
        while (i < lines.length && lines[i].trim() !== "") {
          textLines.push(lines[i]);
          i++;
        }

        if (textLines.length > 0) {
          cues.push({
            startTime,
            endTime,
            text: textLines.join("\n"),
          });
        }
      }
    }
    i++;
  }

  return cues;
}

function parseTime(timeStr: string): number {
  // Handle both , and . as decimal separator
  const normalized = timeStr.replace(",", ".");
  const parts = normalized.split(":");
  const hours = parseFloat(parts[0]);
  const minutes = parseFloat(parts[1]);
  const seconds = parseFloat(parts[2]);
  return hours * 3600 + minutes * 60 + seconds;
}

function stripHtmlTags(text: string): string {
  // Keep line breaks, remove other HTML tags
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export function SubtitleOverlay({
  subtitleUrl,
  currentTime,
  isVisible,
  fontSize,
  fontFamily,
  textColor,
  backgroundColor,
  backgroundOpacity,
  textShadow,
  lineHeight,
  bottomPosition,
}: SubtitleOverlayProps) {
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [activeCue, setActiveCue] = useState<SubtitleCue | null>(null);
  const lastFetchedUrl = useRef<string | null>(null);

  // Fetch and parse subtitle file
  useEffect(() => {
    if (!subtitleUrl || subtitleUrl === lastFetchedUrl.current) return;

    lastFetchedUrl.current = subtitleUrl;

    fetch(subtitleUrl)
      .then((res) => res.text())
      .then((content) => {
        const parsedCues = parseVTT(content);
        setCues(parsedCues);
      })
      .catch((err) => {
        console.error("Failed to load subtitles:", err);
        setCues([]);
      });
  }, [subtitleUrl]);

  // Clear cues when subtitle is disabled
  useEffect(() => {
    if (!subtitleUrl) {
      setCues([]);
      setActiveCue(null);
      lastFetchedUrl.current = null;
    }
  }, [subtitleUrl]);

  // Find active cue based on current time
  useEffect(() => {
    if (!isVisible || cues.length === 0) {
      setActiveCue(null);
      return;
    }

    const cue = cues.find(
      (c) => currentTime >= c.startTime && currentTime <= c.endTime,
    );
    setActiveCue(cue || null);
  }, [currentTime, cues, isVisible]);

  if (!isVisible || !activeCue) {
    return null;
  }

  const bgColorWithOpacity = (() => {
    // Convert hex to rgba
    const hex = backgroundColor.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${backgroundOpacity})`;
  })();

  const style: React.CSSProperties = {
    fontSize: `${fontSize}px`,
    fontFamily,
    color: textColor,
    backgroundColor: bgColorWithOpacity,
    lineHeight: lineHeight,
    bottom: `${bottomPosition}%`,
    textShadow: textShadow
      ? "2px 2px 4px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.6)"
      : "none",
  };

  // Split text by newlines to render each line
  const lines = stripHtmlTags(activeCue.text).split("\n");

  return (
    <div className="subtitle-overlay" style={style}>
      {lines.map((line, idx) => (
        <span key={idx} className="subtitle-line">
          {line}
          {idx < lines.length - 1 && <br />}
        </span>
      ))}
    </div>
  );
}
