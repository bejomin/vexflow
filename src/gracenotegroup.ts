// Copyright (c) 2023-present VexFlow contributors: https://github.com/vexflow/vexflow/graphs/contributors
//
// ## Description
//
// This file implements `GraceNoteGroup` which is used to format and
// render grace notes.

import { Beam } from './beam';
import { Formatter } from './formatter';
import { Modifier } from './modifier';
import { ModifierContextState } from './modifiercontext';
import { Note } from './note';
import { RenderContext } from './rendercontext';
import { StaveNote } from './stavenote';
import { StaveTie, TieRenderCurve } from './stavetie';
import { StemmableNote } from './stemmablenote';
import { Tables } from './tables';
import { TabTie } from './tabtie';
import { Category, isStaveNote } from './typeguard';
import { log } from './util';
import { Voice } from './voice';

// To enable logging for this class. Set `GraceNoteGroup.DEBUG` to `true`.
// eslint-disable-next-line
function L(...args: any) {
  if (GraceNoteGroup.DEBUG) log('VexFlow.GraceNoteGroup', args);
}

export interface GraceNoteSlurBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface GraceNoteSlurLayout {
  curves: TieRenderCurve[];
  direction: number;
  startAttachment: 'notehead' | 'notehead-center' | 'stem-tip';
  endAttachment: 'notehead' | 'notehead-center' | 'stem-tip';
  startNotehead: GraceNoteSlurBounds;
  endNotehead: GraceNoteSlurBounds;
  intersectedEndpointIds: ('start-notehead' | 'end-notehead')[];
}

function pointInsideBounds(point: { x: number; y: number }, bounds: GraceNoteSlurBounds): boolean {
  const epsilon = 0.01;
  return (
    point.x > bounds.left + epsilon &&
    point.x < bounds.right - epsilon &&
    point.y > bounds.top + epsilon &&
    point.y < bounds.bottom - epsilon
  );
}

function quadraticPoint(
  start: { x: number; y: number },
  control: { x: number; y: number },
  end: { x: number; y: number },
  t: number
): { x: number; y: number } {
  const oneMinusT = 1 - t;
  return {
    x: oneMinusT * oneMinusT * start.x + 2 * oneMinusT * t * control.x + t * t * end.x,
    y: oneMinusT * oneMinusT * start.y + 2 * oneMinusT * t * control.y + t * t * end.y,
  };
}

/** GraceNoteGroup is used to format and render grace notes. */
export class GraceNoteGroup extends Modifier {
  static DEBUG: boolean = false;

  static override get CATEGORY(): string {
    return Category.GraceNoteGroup;
  }

  protected readonly voice: Voice;
  protected readonly graceNotes: StemmableNote[];
  protected readonly showSlur?: boolean;

  protected preFormatted: boolean = false;
  protected formatter?: Formatter;
  public renderOptions: { slurYShift: number };
  protected slur?: StaveTie | TabTie;
  protected slurStartIndex: number;
  protected slurStartAttachment: 'notehead' | 'notehead-center' | 'stem-tip' = 'notehead';
  protected slurEndAttachment: 'notehead' | 'notehead-center' | 'stem-tip' = 'notehead';
  protected beams: Beam[];

  /** Arranges groups inside a `ModifierContext`. */
  static format(gracenoteGroups: GraceNoteGroup[], state: ModifierContextState): boolean {
    const groupSpacingStave = 4;
    const groupSpacingTab = 0;

    if (!gracenoteGroups || gracenoteGroups.length === 0) return false;

    const groupList = [];
    let prevNote = null;
    let shift = 0;

    for (let i = 0; i < gracenoteGroups.length; ++i) {
      const gracenoteGroup = gracenoteGroups[i];
      const note = gracenoteGroup.getNote();
      const isStavenote = isStaveNote(note);
      const spacing = isStavenote ? groupSpacingStave : groupSpacingTab;

      if (isStavenote && note !== prevNote) {
        // Iterate through all notes to get the displaced pixels
        for (let n = 0; n < note.keys.length; ++n) {
          shift = Math.max(note.getLeftDisplacedHeadPx(), shift);
        }
        prevNote = note;
      }

      groupList.push({ shift: shift, gracenoteGroup, spacing });
    }

    // If first note left shift in case it is displaced
    let groupShift = groupList[0].shift;
    let formatWidth;
    let right = false;
    let left = false;
    for (let i = 0; i < groupList.length; ++i) {
      const gracenoteGroup = groupList[i].gracenoteGroup;
      if (gracenoteGroup.position === Modifier.Position.RIGHT) right = true;
      else left = true;
      gracenoteGroup.preFormat();
      formatWidth = gracenoteGroup.getWidth() + groupList[i].spacing;
      groupShift = Math.max(formatWidth, groupShift);
    }

    for (let i = 0; i < groupList.length; ++i) {
      const gracenoteGroup = groupList[i].gracenoteGroup;
      formatWidth = gracenoteGroup.getWidth() + groupList[i].spacing;
      gracenoteGroup.setSpacingFromNextModifier(
        groupShift - Math.min(formatWidth, groupShift) + StaveNote.minNoteheadPadding
      );
    }

    if (right) state.rightShift += groupShift;
    if (left) state.leftShift += groupShift;
    return true;
  }

  //** `GraceNoteGroup` inherits from `Modifier` and is placed inside a `ModifierContext`. */
  constructor(graceNotes: StemmableNote[], showSlur?: boolean, slurStartIndex?: number) {
    super();

    this.position = Modifier.Position.LEFT;
    this.graceNotes = graceNotes;
    this.width = 0;

    this.showSlur = showSlur;
    this.slur = undefined;
    this.slurStartIndex = Math.max(0, Math.min(slurStartIndex ?? graceNotes.length - 1, graceNotes.length - 1));

    this.voice = new Voice({
      numBeats: 4,
      beatValue: 4,
      resolution: Tables.RESOLUTION,
    }).setStrict(false);

    this.renderOptions = {
      slurYShift: 0,
    };

    this.beams = [];

    this.voice.addTickables(this.graceNotes);

    return this;
  }

  preFormat(): void {
    if (this.preFormatted) return;

    if (!this.formatter) {
      this.formatter = new Formatter();
    }
    this.formatter.joinVoices([this.voice]).format([this.voice], 0, {});
    this.setWidth(this.formatter.getMinTotalWidth());
    this.preFormatted = true;
  }

  beamNotes(graceNotes?: StemmableNote[]): this {
    graceNotes = graceNotes || this.graceNotes;
    if (graceNotes.length > 1) {
      const beam = new Beam(graceNotes);

      beam.renderOptions.beamWidth = 3;
      beam.renderOptions.partialBeamLength = 4;

      this.beams.push(beam);
    }

    return this;
  }

  override setWidth(width: number): this {
    this.width = width;
    return this;
  }

  override getWidth(): number {
    return this.width + StaveNote.minNoteheadPadding;
  }

  getGraceNotes(): Note[] {
    return this.graceNotes;
  }

  /** Return the finalized grace slur, once the group has been laid out. */
  getSlur(): StaveTie | TabTie | undefined {
    return this.slur;
  }

  /**
   * Return the exact grace-slur outlines consumed by drawing.
   *
   * Grace slurs are drawn directly by GraceNoteGroup. Exposing that final
   * geometry lets callers perform collision diagnostics without reconstructing
   * a curve from rendered output.
   */
  getRenderedSlurCurves(): TieRenderCurve[] {
    return this.slur instanceof StaveTie ? this.slur.getRenderedTieCurves() : [];
  }

  /** Return finalized grace-slur geometry and objective endpoint collisions. */
  getSlurLayout(): GraceNoteSlurLayout | undefined {
    if (!(this.slur instanceof StaveTie)) return undefined;
    const notes = this.slur.getNotes();
    if (!(notes.firstNote instanceof StaveNote) || !(notes.lastNote instanceof StaveNote)) return undefined;

    const startIndex = notes.firstIndexes?.[0] ?? 0;
    const endIndex = notes.lastIndexes?.[0] ?? 0;
    const start = notes.firstNote.getSelectedNoteHeadBounds(startIndex);
    const end = notes.lastNote.getSelectedNoteHeadBounds(endIndex);
    const startNotehead: GraceNoteSlurBounds = {
      left: start.left,
      right: start.right,
      top: start.top,
      bottom: start.bottom,
    };
    const endNotehead: GraceNoteSlurBounds = {
      left: end.left,
      right: end.right,
      top: end.top,
      bottom: end.bottom,
    };
    const curves = this.getRenderedSlurCurves();
    const intersectedEndpointIds: ('start-notehead' | 'end-notehead')[] = [];
    for (const [id, bounds] of [
      ['start-notehead', startNotehead],
      ['end-notehead', endNotehead],
    ] as const) {
      const intersects = curves.some((curve) => {
        for (let sample = 1; sample < 24; sample++) {
          const t = sample / 24;
          if (
            pointInsideBounds(quadraticPoint(curve.start, curve.topControl, curve.end, t), bounds) ||
            pointInsideBounds(quadraticPoint(curve.start, curve.bottomControl, curve.end, t), bounds)
          ) {
            return true;
          }
        }
        return false;
      });
      if (intersects) intersectedEndpointIds.push(id);
    }
    return {
      curves,
      direction: this.slur.getDirection(),
      startAttachment: this.slurStartAttachment,
      endAttachment: this.slurEndAttachment,
      startNotehead,
      endNotehead,
      intersectedEndpointIds,
    };
  }

  override draw(): void {
    const ctx: RenderContext = this.checkContext();
    const note = this.checkAttachedNote();
    this.setRendered();

    L('Drawing grace note group for:', note);

    this.alignSubNotesWithNote(this.getGraceNotes(), note, this.position); // Modifier function

    // Draw grace notes.
    this.graceNotes.forEach((graceNote) => graceNote.setContext(ctx).drawWithStyle());
    // Draw beams.
    this.beams.forEach((beam) => beam.setContext(ctx).drawWithStyle());

    if (this.showSlur) {
      // Create and draw slur.
      this.slurStartAttachment = 'notehead';
      this.slurEndAttachment = 'notehead';
      const isStavenote = isStaveNote(note);
      const TieClass = isStavenote ? StaveTie : TabTie;

      // A grace slur follows musical order from its source-selected grace note
      // into the main note. Callers without source detail retain the historical
      // nearest-grace default.
      const slurStartNote = this.graceNotes[this.slurStartIndex];
      this.slur = new TieClass({
        firstNote: slurStartNote,
        lastNote: note,
        firstIndexes: [0],
        lastIndexes: [0],
      });
      this.slur.renderOptions.yShift = (isStavenote ? 7 : 5) + this.renderOptions.slurYShift;

      if (this.slur instanceof StaveTie && isStavenote) {
        const graceY = slurStartNote.getYs()[0];
        const mainY = note.getYs()[0];
        if (Math.abs(mainY - graceY) >= 2 * Tables.STAVE_LINE_DISTANCE) {
          // On a large leap, following the main note's stem can put the slur
          // inside the interval and make its diagonal cross a connected head.
          // Route it around the outside of the leap: above when the grace note
          // is higher, below when it is lower. Close grace gestures retain the
          // conventional stem-derived placement.
          this.slur.setDirection(graceY < mainY ? -1 : 1);
        }

        const direction = this.slur.getDirection();
        const attachStemTip = (
          endpoint: 'start' | 'end',
          endpointNote: StemmableNote,
          defaultX: number,
          defaultY: number
        ): void => {
          if (!endpointNote.hasStem() || endpointNote.getStemDirection() !== -direction) return;
          const stemX = endpointNote.getStemX();
          const stemTipY = endpointNote.getStemExtents().topY;
          if (endpoint === 'start') {
            this.slur!.renderOptions.firstXShift = stemX - defaultX;
            this.slur!.renderOptions.firstYShift = stemTipY - defaultY;
            this.slurStartAttachment = 'stem-tip';
          } else {
            this.slur!.renderOptions.lastXShift = stemX - defaultX;
            this.slur!.renderOptions.lastYShift = stemTipY - defaultY;
            this.slurEndAttachment = 'stem-tip';
          }
        };
        const yShift = this.slur.renderOptions.yShift * direction;
        attachStemTip('start', slurStartNote, this.slur.getFirstX(), graceY + yShift);
        attachStemTip('end', note, this.slur.getLastX(), mainY + yShift);
        if (this.slurEndAttachment === 'notehead') {
          const mainNotehead = note.getSelectedNoteHeadBounds(0);
          this.slur.renderOptions.lastXShift = mainNotehead.centerX - this.slur.getLastX();
          this.slurEndAttachment = 'notehead-center';
        }
        if (this.slurStartIndex < this.graceNotes.length - 1) {
          // A multi-note grace slur starts at the first source grace stem and
          // must remain visibly above the intervening beam. For a quadratic
          // curve, the midpoint travels only halfway towards its control
          // point, so double both the endpoint delta and desired clearance.
          // This keeps the visible inner edge 0.6 staff-spaces outside the
          // higher endpoint even when the gesture is diagonal.
          const renderedStartY = graceY + yShift + this.slur.renderOptions.firstYShift;
          const renderedEndY = mainY + yShift + this.slur.renderOptions.lastYShift;
          const controlHeight = Math.abs(renderedEndY - renderedStartY) + 1.2 * Tables.STAVE_LINE_DISTANCE;
          this.slur.renderOptions.cp1 = controlHeight;
          this.slur.renderOptions.cp2 = controlHeight + 4;
        }
      }
      if (this.slurStartIndex >= this.graceNotes.length - 1) this.slur.renderOptions.cp2 = 12;
      this.slur.setContext(ctx).drawWithStyle();
    }
  }
}
