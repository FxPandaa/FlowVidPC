/**
 * Parse SRT subtitle format to VTT for HTML5 video
 */
export function srtToVtt(srtContent: string): string {
  // VTT header
  let vtt = "WEBVTT\n\n";

  // Split into subtitle blocks
  const blocks = srtContent.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.split("\n");

    if (lines.length < 3) continue;

    // Skip subtitle number (line 0)
    // Get timecode (line 1)
    const timecode = lines[1].replace(/,/g, ".");

    // Get text (lines 2+)
    const text = lines.slice(2).join("\n");

    vtt += `${timecode}\n${text}\n\n`;
  }

  return vtt;
}

/**
 * Create a blob URL from subtitle content for use in <track> element
 */
export function createSubtitleBlobUrl(content: string, format: string): string {
  let vttContent = content;

  // Convert SRT to VTT if needed
  if (format.toLowerCase() === "srt") {
    vttContent = srtToVtt(content);
  }

  // Ensure VTT header is present
  if (!vttContent.startsWith("WEBVTT")) {
    vttContent = "WEBVTT\n\n" + vttContent;
  }

  const blob = new Blob([vttContent], { type: "text/vtt" });
  return URL.createObjectURL(blob);
}

/**
 * Convert timecode string to seconds
 */
export function timecodeToSeconds(timecode: string): number {
  const parts = timecode.split(":");
  const hours = parseInt(parts[0]) || 0;
  const minutes = parseInt(parts[1]) || 0;
  const seconds = parseFloat(parts[2]) || 0;

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Convert seconds to timecode string
 */
export function secondsToTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`;
}

/**
 * Adjust subtitle timing (offset in seconds)
 */
export function adjustSubtitleTiming(
  vttContent: string,
  offsetSeconds: number,
): string {
  const lines = vttContent.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    // Check if line contains timecode (format: 00:00:00.000 --> 00:00:00.000)
    if (line.includes("-->")) {
      const parts = line.split("-->");
      if (parts.length === 2) {
        const start = timecodeToSeconds(parts[0].trim()) + offsetSeconds;
        const end = timecodeToSeconds(parts[1].trim()) + offsetSeconds;

        // Don't allow negative timestamps
        if (start >= 0 && end >= 0) {
          result.push(
            `${secondsToTimecode(start)} --> ${secondsToTimecode(end)}`,
          );
        } else {
          result.push(line); // Keep original if offset makes it negative
        }
      } else {
        result.push(line);
      }
    } else {
      result.push(line);
    }
  }

  return result.join("\n");
}
