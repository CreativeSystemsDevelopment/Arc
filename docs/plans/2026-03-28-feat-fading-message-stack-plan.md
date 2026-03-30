---
title: Fading Message Stack UI Enhancement
type: feat
status: active
date: 2026-03-28
---

# Fading Message Stack UI Enhancement

## Overview

Transform the current chat interface from individual glass message panels to a premium "fading message stack" effect where messages appear directly on the large base glass panel. New messages push older messages upward, with a maximum of 3 visible messages before older ones gracefully dematerialize using blur, opacity, and scale effects.

## Problem Statement / Motivation

The current chat UI uses nested glass panels (large base panel containing smaller individual message panels). While polished, this creates visual redundancy and adds cognitive load. The proposed "direct print" approach with integrated fade effects will:

- **Reduce visual clutter**: Eliminate nested glass containers for cleaner aesthetics
- **Create premium motion**: The push-and-fade motion mimics cinematic techniques and high-end interfaces
- **Maintain glass morphism**: Messages will still feel integrated with the glass panel through coordinated transparency and blur
- **Improve message flow**: The upward push creates a natural reading progression (newest at bottom, history fading above)

## Proposed Solution

### Visual Design

```
┌─────────────────────────────────────────────────────────┐
│  Large Glass Base Panel (existing)                      │
│  ┌─────────────────────────────────────────────────┐    │
│  │                                                 │    │
│  │   Message 1 (oldest) ─────► Fading...          │    │
│  │   opacity: 0.3  blur(4px)  y: -20px             │    │
│  │                                                 │    │
│  │   Message 2 ──────────────► Fully visible      │    │
│  │   opacity: 1    blur(0)    y: 0               │    │
│  │                                                 │    │
│  │   Message 3 (newest) ─────► Fully visible      │    │
│  │   opacity: 1    blur(0)    y: 0               │    │
│  │                                                 │    │
│  │   [Message 4 enters] ─────► Push all up        │    │
│  │                                                 │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Animation Architecture

**Message Entry (New Message at Bottom)**
- Initial state: `opacity: 0`, `y: 40px`, `blur(8px)`, `scale: 0.96`
- Animate to: `opacity: 1`, `y: 0`, `blur(0)`, `scale: 1`
- Spring physics: `stiffness: 400`, `damping: 30`
- Duration: ~400ms

**Push Animation (All Existing Messages)**
- Triggered when new message enters
- Each message shifts up by ~1 message height
- Uses Framer Motion `layout` prop for automatic position transitions
- Spring physics for natural feel

**Dematerialize/Fade Exit (Oldest Message, 4th+ arrival)**
- Trigger: When 4th message enters, oldest begins exit
- Combined effect:
  - `opacity: 0` (fade out)
  - `blur(12px)` (lose focus)
  - `scale: 0.94` (slight shrink)
  - `y: -60px` (push further up during fade)
- Duration: 500ms (slower than entry for cinematic effect)
- Easing: `easeIn` for smooth departure

**Stack State Machine**
| State | Messages Visible | Behavior |
|-------|------------------|----------|
| Empty | 0 | Show subtle placeholder or idle state |
| Building | 1-2 | Messages stack at bottom, no fade |
| Full | 3 | All visible, stable stack |
| Overflow | 4+ | Oldest fades, newest enters, continuous conveyor |

## Technical Approach

### Files to Modify

1. **`/home/eshan/arc/Arc/frontend/app/components/DecayStream.tsx`** (Primary)
   - Remove individual glass panel wrappers from messages
   - Implement stack logic with `MAX_VISIBLE = 3`
   - Add Framer Motion `AnimatePresence` with `mode="popLayout"`
   - Implement combined blur/opacity/scale exit variants

2. **`/home/eshan/arc/Arc/frontend/app/components/AgentChat.tsx`** (Layout)
   - Ensure base glass panel has sufficient padding for message content
   - May need to adjust grid/flex layout to accommodate direct message children

3. **`/home/eshan/arc/Arc/frontend/app/globals.css`** (Styling)
   - Add mask-image gradient for edge fade effect
   - Consider adding film grain or subtle texture overlay for premium feel
   - Ensure reduced motion media query support

### Implementation Details

**Message Stack Component Structure**
```tsx
// DecayStream.tsx - New Implementation
<motion.div className="flex flex-col-reverse gap-4 relative">
  <AnimatePresence mode="popLayout">
    {visibleMessages.map((message, index) => (
      <motion.article
        key={message.id}
        layout
        initial={{ opacity: 0, y: 40, scale: 0.96, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -60, scale: 0.94, filter: "blur(12px)" }}
        transition={{ 
          type: "spring", 
          stiffness: 400, 
          damping: 30,
          exit: { duration: 0.5, ease: "easeIn" }
        }}
        className="relative px-4 py-3 text-white/90"
      >
        {/* Message content directly on glass panel */}
        <div className="prose-agent">{message.content}</div>
      </motion.article>
    ))}
  </AnimatePresence>
</motion.div>
```

**Stack Management Logic**
```tsx
const MAX_VISIBLE = 3;

// When new message arrives
const addMessage = (newMessage: Message) => {
  setMessages(prev => {
    // Add to front (visually bottom in flex-col-reverse)
    // Slice to keep only MAX_VISIBLE
    const updated = [newMessage, ...prev].slice(0, MAX_VISIBLE);
    return updated;
  });
};
```

**Edge Fade Effect (CSS Mask)**
```css
.message-stack-container {
  mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    black 10%,
    black 80%,
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    black 10%,
    black 80%,
    transparent 100%
  );
}
```

### Animation Specifications

| Animation | Duration | Easing | Properties |
|-----------|----------|--------|------------|
| Message Enter | 400ms | Spring (stiffness: 400, damping: 30) | opacity, y, scale, blur |
| Push Existing | 300ms | Spring (stiffness: 500, damping: 35) | y (layout prop) |
| Dematerialize Exit | 500ms | easeIn | opacity, y, scale, blur |
| Stagger Delay | 50ms | Linear | Between rapid messages |

**Reduced Motion Fallback**
```tsx
const prefersReducedMotion = useReducedMotion();

const variants = prefersReducedMotion ? {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } }
} : {
  // Full spring/blur/scale animation variants
};
```

## Visual Differentiation (User vs AI)

Since we're removing individual glass panels, differentiate message roles through:

| Role | Visual Treatment |
|------|------------------|
| **User** | Left accent line (`border-l-2 border-cyan-400/50`), subtle cyan text glow |
| **AI (Assistant)** | Left accent line (`border-l-2 border-violet-300/50`), standard white text |
| **AI (High Importance)** | Enhanced glow, possible icon indicator |
| **Pinned** | Preserved with subtle border/glow treatment |

## Acceptance Criteria

### Functional Requirements
- [ ] Individual glass message panels removed - messages print directly on base panel
- [ ] New messages enter at bottom (visually) and push existing messages upward
- [ ] Maximum 3 messages remain fully visible simultaneously
- [ ] 4th message arrival triggers dematerialize animation on oldest message
- [ ] Dematerialize effect combines blur, opacity fade, scale reduction, and upward motion
- [ ] Messages are removed from DOM after exit animation completes

### Animation Quality
- [ ] Entry animation uses spring physics (stiffness: 400, damping: 30)
- [ ] Exit animation uses 500ms duration with easeIn easing
- [ ] Push animation uses layout prop for smooth position transitions
- [ ] Blur effect: 8px on enter, 0 at rest, 12px on exit
- [ ] Scale effect: 0.96 on enter, 1 at rest, 0.94 on exit
- [ ] All animations maintain 60fps on target devices

### Visual Polish
- [ ] Edge gradient mask creates smooth fade at panel boundaries
- [ ] Message role differentiation maintained (user vs AI via accent lines)
- [ ] Glass morphism aesthetic preserved (coordinated with existing design system)
- [ ] Empty state is visually clean (no broken layout)

### Accessibility
- [ ] Respects `prefers-reduced-motion` (fallback to opacity-only transitions)
- [ ] Screen reader announcements via `aria-live="polite"` region
- [ ] Focusable content within messages remains accessible
- [ ] Color contrast meets WCAG 2.1 AA standards

### Edge Cases
- [ ] Handles rapid message bursts (3+ messages/second) with 50ms stagger
- [ ] Gracefully handles variable message lengths (multi-line content)
- [ ] Works correctly at all viewport sizes (responsive)
- [ ] No visual glitches during window resize

## Success Metrics

- **Animation Smoothness**: 60fps maintained during all transitions (Chrome DevTools Performance panel)
- **Visual Feedback**: Messages clearly readable with no motion-induced discomfort
- **Accessibility**: Passes axe-core accessibility audit with no violations
- **User Experience**: Messages feel "premium" and "intentional" (qualitative feedback)

## Dependencies & Risks

### Dependencies
- Framer Motion (already in project)
- Existing glass morphism design system
- `useReducedMotion()` hook pattern (exists in codebase)

### Risks & Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Blur performance** | Medium | Use GPU-accelerated transforms; test on low-end devices; consider disabling blur on mobile |
| **Message height variation** | Medium | Implement `max-height` with overflow handling or use `layout` prop carefully |
| **Rapid message burst** | Medium | Implement 50ms stagger delay; queue messages if arriving faster than animation can handle |
| **Reduced motion edge cases** | Low | Thoroughly test with macOS "Reduce motion" and Windows "Show animations" disabled |

## Alternative Approaches Considered

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| **Fading Stack (Selected)** | Cinematic, premium, integrated with glass panel | Requires careful animation tuning | ✅ Selected - matches vision |
| **Traditional Auto-Scroll** | Simple, familiar | Loses premium feel, keeps nested panels | ❌ Rejected - doesn't meet vision |
| **Carousel/Slider** | Novel interaction | Breaks message continuity, complex UX | ❌ Rejected - too disruptive |
| **Infinite Scroll History** | All messages accessible | Loses ephemeral feel, more complex | ❌ Rejected - contradicts "dematerialize" concept |

## Future Considerations

- **Message History**: Consider a "scroll up for history" gesture or dedicated history panel if users need to reference faded messages
- **Pause on Hover**: Optional feature to pause dematerialization when user hovers the panel
- **Activity Indicator**: Subtle glow pulse when new messages arrive (draws attention)
- **Sound Design**: Optional subtle audio cue for message arrival (maintains accessibility without visual dependency)

## References & Research

### Internal Code References
- Current message visual variants: `Arc/frontend/app/components/DecayStream.tsx:13-45`
- Glass panel design system: `Arc/frontend/app/globals.css:91-100`
- Framer Motion patterns: `Arc/frontend/app/components/DecayStream.tsx:55-62`
- Reduced motion hook pattern: `Arc/frontend/app/components/AgentChat.tsx` (existing usage)

### External Research
- Framer Motion `AnimatePresence` with `mode="popLayout"` documentation
- CSS `mask-image` for gradient fade effects
- Glass morphism best practices (semi-transparent backgrounds + backdrop blur)
- Animation timing guidelines: entry 300-400ms, exit 60-70% of entry duration

### Related Files
- `Arc/frontend/app/components/AgentChat.tsx` - Main chat layout
- `Arc/frontend/app/components/CommandConduit.tsx` - Input styling reference
- `Arc/frontend/app/components/ArcMarkdown.tsx` - Message content rendering
- `Arc/frontend/app/globals.css` - Design system tokens and utilities

---

**Plan Version**: 1.0  
**Last Updated**: 2026-03-28  
**Status**: Ready for implementation
