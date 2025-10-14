import { useState, useRef, useEffect, CSSProperties, PointerEvent } from "react";
import PixelartIcon from "./PixelartIcon";
import { options } from "../optionsStorage";
import { musicSystem } from "../sounds/musicSystem";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
    forceStartMusic?: () => void;
    __ignorePointerLock?: boolean;
  }
}

export default function AudioControls() {
  const [volume, setVolume] = useState<number>(options.volume ?? 50);
  const [musicEnabled, setMusicEnabled] = useState<boolean>(options.enableMusic ?? true);
  const [isInteracting, setIsInteracting] = useState<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // --- helpers ---
  const resumeAudioContext = () => {
    if (!audioContextRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new Ctx();
    }
    if (audioContextRef.current.state === "suspended") {
      void audioContextRef.current.resume();
    }
  };

  const exitPointerLock = () => {
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
  };

  useEffect(() => {
    const handler = () => {
      if (document.pointerLockElement && isInteracting) exitPointerLock();
    };
    document.addEventListener("pointerlockchange", handler);
    return () => document.removeEventListener("pointerlockchange", handler);
  }, [isInteracting]);

  const beginInteraction = () => {
    setIsInteracting(true);
    delayPointerReacquire();
    window.__ignorePointerLock = true;
    exitPointerLock();
  };

  const endInteraction = () => {
    setIsInteracting(false);
    window.__ignorePointerLock = false;
  };

  const delayPointerReacquire = () => {
    window.__ignorePointerLock = true;
    setTimeout(() => {
      window.__ignorePointerLock = false;
    }, 500);
  };

  const changeVolume = (delta: number) => {
    const newVolume = Math.max(0, Math.min(100, volume + delta));
    setVolume(newVolume);
    options.volume = newVolume;
    resumeAudioContext();
  };

  const toggleMusic = () => {
    const newState = !musicEnabled;
    setMusicEnabled(newState);
    options.enableMusic = newState;
    resumeAudioContext();

    if (newState) {
      window.forceStartMusic?.();
    } else {
      musicSystem.stopMusic();
    }
  };

  // --- layout constants ---
  const ICON_WRAP = 14;
  const GLYPH = 10;
  const GAP = 4;

  const getVolumeIconName = (v: number): string => {
    if (v <= 0) return "volume-x";
    if (v <= 33) return "volume-1";
    if (v <= 66) return "volume-2";
    return "volume-3";
  };

  const makeButtonStyle = (extra?: CSSProperties): CSSProperties => ({
    width: `${ICON_WRAP}px`,
    height: `${ICON_WRAP}px`,
    padding: 0,
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(255,255,255,0.10)",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: "4px",
    cursor: "pointer",
    ...extra,
  });

  const containerStyle: CSSProperties = {
    position: "absolute",
    bottom: "5px",
    right: "5px",
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    gap: `${GAP}px`,
    padding: "3px 6px",
    background: "rgba(0,0,0,0.65)",
    borderRadius: "6px",
    color: "white",
    fontFamily: '"VT323", monospace',
    fontSize: "11px",
    lineHeight: 1,
    pointerEvents: "auto",
    userSelect: "none",
  };

  // --- component ---
  return (
    <>
      <style>
        {`
          .audio-icon-fix {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 10px;
            height: 10px;
            font-size: 10px;
            line-height: 1;
            vertical-align: middle;
            transform: translateY(-0.2px);
          }
          .audio-icon-muted {
            opacity: 0.4;
            filter: grayscale(100%);
          }
        `}
      </style>

      <div
        style={containerStyle}
        onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
          e.stopPropagation();
          beginInteraction();
        }}
        onPointerUp={(e: PointerEvent<HTMLDivElement>) => {
          e.stopPropagation();
          endInteraction();
        }}
      >
        {/* volume icon */}
        <div
          style={{
            width: ICON_WRAP,
            height: ICON_WRAP,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <PixelartIcon
            iconName={getVolumeIconName(volume)}
            className="audio-icon-fix"
            width={GLYPH}
          />
        </div>

        {/* volume down */}
        <button
          title="Volume down"
          onClick={(e) => {
            e.stopPropagation();
            changeVolume(-10);
          }}
          style={makeButtonStyle()}
        >
          <PixelartIcon iconName="minus" className="audio-icon-fix" width={GLYPH} />
        </button>

        {/* volume percent */}
        <div style={{ minWidth: "28px", textAlign: "center" }}>{volume}%</div>

        {/* volume up */}
        <button
          title="Volume up"
          onClick={(e) => {
            e.stopPropagation();
            changeVolume(10);
          }}
          style={makeButtonStyle()}
        >
          <PixelartIcon iconName="plus" className="audio-icon-fix" width={GLYPH} />
        </button>

        {/* music toggle */}
        <button
          title={musicEnabled ? "Turn music off" : "Turn music on"}
          onClick={(e) => {
            e.stopPropagation();
            toggleMusic();
          }}
          style={makeButtonStyle(
            musicEnabled
              ? { border: "1px solid rgba(180,220,255,0.6)" }
              : undefined
          )}
        >
          <PixelartIcon
            iconName="music"
            className={`audio-icon-fix ${!musicEnabled ? "audio-icon-muted" : ""}`}
            width={GLYPH}
          />
        </button>
      </div>
    </>
  );
}
