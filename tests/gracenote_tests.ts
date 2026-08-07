// Copyright (c) 2023-present VexFlow contributors: https://github.com/vexflow/vexflow/graphs/contributors
// MIT License
//
// GraceNote Tests

// TODO: In the 'stem' test (aka Grace Note Stem › SVG + Petaluma in flow.html), the Petaluma note heads are not scaled down properly.

import { TestOptions, VexFlowTests } from './vexflow_test_helpers';

import { ModifierPosition } from '../src';
import { Accidental } from '../src/accidental';
import { Annotation } from '../src/annotation';
import { Articulation } from '../src/articulation';
import { Beam } from '../src/beam';
import { Dot } from '../src/dot';
import { Factory } from '../src/factory';
import { Formatter } from '../src/formatter';
import { GraceNote, GraceNoteStruct } from '../src/gracenote';
import { GraceNoteGroup } from '../src/gracenotegroup';
import { StaveNote, StaveNoteStruct } from '../src/stavenote';
import { Tables } from '../src/tables';

function curveIntersectsBounds(
  curve: {
    start: { x: number; y: number };
    topControl: { x: number; y: number };
    end: { x: number; y: number };
    bottomControl: { x: number; y: number };
  },
  bounds: { left: number; right: number; top: number; bottom: number }
): boolean {
  for (let sample = 1; sample < 24; sample++) {
    const t = sample / 24;
    const oneMinusT = 1 - t;
    const points = [curve.topControl, curve.bottomControl].map((control) => ({
      x: oneMinusT * oneMinusT * curve.start.x + 2 * oneMinusT * t * control.x + t * t * curve.end.x,
      y: oneMinusT * oneMinusT * curve.start.y + 2 * oneMinusT * t * control.y + t * t * curve.end.y,
    }));
    if (
      points.some(
        (point) => point.x > bounds.left && point.x < bounds.right && point.y > bounds.top && point.y < bounds.bottom
      )
    ) {
      return true;
    }
  }
  return false;
}

function graceNoteRightEdge(note: StaveNote): number {
  let right = note.getTieRightX();
  if (note.shouldDrawFlag()) {
    right = Math.max(right, note.getStemX() - Tables.STEM_WIDTH / 2 + note.getGlyphWidth());
  }
  note.getModifiersByType(Dot.CATEGORY).forEach((dot) => {
    const index = dot.getIndex() ?? 0;
    const start = note.getModifierStartXY(ModifierPosition.RIGHT, index, { forceFlagRight: true });
    right = Math.max(right, start.x + dot.getXShift() + dot.getWidth());
  });
  return right;
}

function graceNoteLeftEdge(note: StaveNote): number {
  const accidentals = note.getModifiersByType(Accidental.CATEGORY);
  if (accidentals.length > 0) {
    return Math.min(...accidentals.map((accidental) => accidental.getBoundingBox().getX()));
  }
  return Math.min(
    ...note.noteHeads.map((noteHead) => {
      const bounds = noteHead.getBoundingBoxAt(note.getNoteHeadBeginX());
      return bounds.getX();
    })
  );
}

function noteheadLeftEdge(note: StaveNote): number {
  return Math.min(...note.noteHeads.map((noteHead) => noteHead.getBoundingBoxAt(note.getNoteHeadBeginX()).getX()));
}

const GraceNoteTests = {
  Start(): void {
    QUnit.module('Grace Notes');
    const run = VexFlowTests.runTests;
    run('Grace Note Basic', basic);
    run('With Articulation and Annotation on Parent Note', graceNoteModifiers);
    run('Grace Note Basic with Slurs', basicSlurred);
    run('Grace Note Stem', stem);
    run('Grace Note Stem with Beams 1', stemWithBeamed, {
      keys1: ['g/4'],
      stemDirection1: 1,
      keys2: ['d/5'],
      stemDirection2: -1,
    });
    run('Grace Note Stem with Beams 2', stemWithBeamed, {
      keys1: ['a/3'],
      stemDirection1: 1,
      keys2: ['a/5'],
      stemDirection2: -1,
    });
    run('Grace Note Stem with Beams 3', stemWithBeamed, {
      keys1: ['c/4'],
      stemDirection1: 1,
      keys2: ['c/6'],
      stemDirection2: -1,
    });
    run('Grace Note Slash', slash);
    run('Grace Note Slash with Beams', slashWithBeams);
    run('Grace Notes Multiple Voices', multipleVoices);
    run('Grace Notes Multiple Voices Multiple Draws', multipleVoicesMultipleDraws);
  },
};

function basic(options: TestOptions): void {
  const f = VexFlowTests.makeFactory(options, 700, 130);
  const stave = f.Stave({ x: 10, y: 10, width: 650 });

  const gracenotes = [
    { keys: ['e/4'], duration: '32' },
    { keys: ['f/4'], duration: '32' },
    { keys: ['g/4'], duration: '32' },
    { keys: ['a/4'], duration: '32' },
  ].map(f.GraceNote.bind(f));

  const gracenotes1 = [{ keys: ['b/4'], duration: '8', slash: false }].map(f.GraceNote.bind(f));

  const gracenotes2 = [{ keys: ['b/4'], duration: '8', slash: true }].map(f.GraceNote.bind(f));

  const gracenotes3 = [
    { keys: ['e/4'], duration: '8' },
    { keys: ['f/4'], duration: '16' },
    { keys: ['e/4', 'g/4'], duration: '8' },
    { keys: ['a/4'], duration: '32' },
    { keys: ['b/4'], duration: '32' },
  ].map(f.GraceNote.bind(f));

  const gracenotes4 = [
    { keys: ['g/4'], duration: '8' },
    { keys: ['g/4'], duration: '16' },
    { keys: ['g/4'], duration: '16' },
  ].map(f.GraceNote.bind(f));

  gracenotes[1].addModifier(f.Accidental({ type: '##' }), 0);
  gracenotes3[3].addModifier(f.Accidental({ type: 'bb' }), 0);
  Dot.buildAndAttach([gracenotes4[0]], { all: true });

  const notes = [
    f
      .StaveNote({ keys: ['b/4'], duration: '4', autoStem: true })
      .addModifier(f.GraceNoteGroup({ notes: gracenotes }).beamNotes(), 0),
    f
      .StaveNote({ keys: ['c/5'], duration: '4', autoStem: true })
      .addModifier(f.Accidental({ type: '#' }), 0)
      .addModifier(f.GraceNoteGroup({ notes: gracenotes1 }).beamNotes(), 0),
    f
      .StaveNote({ keys: ['c/5', 'd/5'], duration: '4', autoStem: true })
      .addModifier(f.GraceNoteGroup({ notes: gracenotes2 }).beamNotes(), 0),
    f
      .StaveNote({ keys: ['a/4'], duration: '4', autoStem: true })
      .addModifier(f.GraceNoteGroup({ notes: gracenotes3 }).beamNotes(), 0),
    f
      .StaveNote({ keys: ['a/4'], duration: '4', autoStem: true })
      .addModifier(f.GraceNoteGroup({ notes: gracenotes4 }).beamNotes().setPosition(ModifierPosition.RIGHT), 0),
  ];

  const voice = f.Voice().setStrict(false).addTickables(notes);

  new Formatter().joinVoices([voice]).formatToStave([voice], stave);

  f.draw();

  options.assert.ok(true, 'GraceNoteBasic');
}
function graceNoteModifiers(options: TestOptions): void {
  const f = VexFlowTests.makeFactory(options, 700, 130);
  const stave = f.Stave({ x: 10, y: 10, width: 650 });

  const gracenotes = [{ keys: ['b/4'], duration: '8', slash: false }].map(f.GraceNote.bind(f));

  const notes = [
    f
      .StaveNote({ keys: ['c/5'], duration: '4', autoStem: true })
      .addModifier(f.GraceNoteGroup({ notes: gracenotes }), 0),
    f
      .StaveNote({ keys: ['c/5'], duration: '4', autoStem: true })
      .addModifier(f.GraceNoteGroup({ notes: gracenotes }), 0)
      .addModifier(new Articulation('a-').setPosition(3), 0),
    f
      .StaveNote({ keys: ['c/5'], duration: '4', autoStem: true })
      .addModifier(f.GraceNoteGroup({ notes: gracenotes }), 0)
      .addModifier(new Articulation('a-').setPosition(3), 0)
      .addModifier(new Accidental('#')),
    f
      .StaveNote({ keys: ['c/5'], duration: '4', autoStem: true })
      .addModifier(f.GraceNoteGroup({ notes: gracenotes }), 0)
      .addModifier(new Articulation('a-').setPosition(3), 0)
      .addModifier(new Annotation('words')),
    f
      .StaveNote({ keys: ['c/5'], duration: '4', autoStem: true })
      .addModifier(f.GraceNoteGroup({ notes: gracenotes }), 0)
      .addModifier(new Articulation('a-').setPosition(3), 0)
      .addModifier(new Articulation('a>').setPosition(3), 0),
    f
      .StaveNote({ keys: ['c/5'], duration: '4', autoStem: true })
      .addModifier(f.GraceNoteGroup({ notes: gracenotes }), 0)
      .addModifier(new Articulation('a-').setPosition(3), 0)
      .addModifier(new Articulation('a>').setPosition(3), 0)
      .addModifier(new Articulation('a@a').setPosition(3), 0),
  ];

  const voice = f.Voice().setStrict(false).addTickables(notes);

  new Formatter().joinVoices([voice]).formatToStave([voice], stave);

  f.draw();

  options.assert.ok(true, 'GraceNoteModifiers');
}
function basicSlurred(options: TestOptions): void {
  const f = VexFlowTests.makeFactory(options, 700, 130);
  const stave = f.Stave({ x: 10, y: 10, width: 650 });

  const gracenotes0 = [
    { keys: ['e/4'], duration: '32' },
    { keys: ['f/4'], duration: '32' },
    { keys: ['g/4'], duration: '32' },
    { keys: ['a/4'], duration: '32' },
  ].map(f.GraceNote.bind(f));

  const gracenotes1 = [{ keys: ['b/4'], duration: '8', slash: false }].map(f.GraceNote.bind(f));

  const gracenotes2 = [{ keys: ['b/4'], duration: '8', slash: true }].map(f.GraceNote.bind(f));

  const gracenotes3 = [
    { keys: ['e/4'], duration: '8' },
    { keys: ['f/4'], duration: '16' },
    { keys: ['e/4', 'g/4'], duration: '8' },
    { keys: ['a/4'], duration: '32' },
    { keys: ['b/4'], duration: '32' },
  ].map(f.GraceNote.bind(f));

  const gracenotes4 = [
    { keys: ['a/4'], duration: '8' },
    { keys: ['a/4'], duration: '16' },
    { keys: ['a/4'], duration: '16' },
  ].map(f.GraceNote.bind(f));

  gracenotes0[1].addModifier(f.Accidental({ type: '#' }), 0);
  gracenotes3[3].addModifier(f.Accidental({ type: 'b' }), 0);
  gracenotes3[2].addModifier(f.Accidental({ type: 'n' }), 0);
  Dot.buildAndAttach([gracenotes4[0]], { all: true });

  const firstGraceGroup = f.GraceNoteGroup({ notes: gracenotes0, slur: true, slurStartIndex: 0 }).beamNotes();
  const secondGraceGroup = f.GraceNoteGroup({ notes: gracenotes1, slur: true }).beamNotes();
  const thirdGraceGroup = f.GraceNoteGroup({ notes: gracenotes2, slur: true }).beamNotes();
  const fourthGraceGroup = f.GraceNoteGroup({ notes: gracenotes3, slur: true }).beamNotes();
  const fifthGraceGroup = f.GraceNoteGroup({ notes: gracenotes4, slur: true }).beamNotes();
  const steepGraceNotes = [{ keys: ['e/6'], duration: '8', stemDirection: 1 }].map(f.GraceNote.bind(f));
  const steepGraceGroup = f.GraceNoteGroup({ notes: steepGraceNotes, slur: true });
  const steepMainNote = f.StaveNote({ keys: ['a/4'], duration: '4', stemDirection: 1 });
  const secondMainNote = f.StaveNote({ keys: ['c/5'], duration: '4', autoStem: true });
  const secondAccidental = f.Accidental({ type: '#' });
  const thirdMainNote = f.StaveNote({ keys: ['c/5', 'd/5'], duration: '4', autoStem: true });
  const fourthMainNote = f.StaveNote({ keys: ['a/4'], duration: '4', autoStem: true });
  const fifthMainNote = f.StaveNote({ keys: ['a/4'], duration: '4', autoStem: true });
  const notes = [
    f.StaveNote({ keys: ['b/4'], duration: '4', autoStem: true }).addModifier(firstGraceGroup, 0),
    secondMainNote.addModifier(secondAccidental, 0).addModifier(secondGraceGroup, 0),
    thirdMainNote.addModifier(thirdGraceGroup, 0),
    fourthMainNote.addModifier(fourthGraceGroup, 0),
    fifthMainNote.addModifier(fifthGraceGroup, 0),
    steepMainNote.addModifier(steepGraceGroup, 0),
  ];

  const voice = f.Voice().setStrict(false).addTickables(notes);

  new Formatter().joinVoices([voice]).formatToStave([voice], stave);

  f.draw();

  const slur = (firstGraceGroup as GraceNoteGroup).getSlur();
  options.assert.strictEqual(slur?.getNotes().firstNote, gracenotes0[0], 'slur preserves its source grace note');
  options.assert.strictEqual(slur?.getNotes().lastNote, notes[0], 'slur ends at main note');
  const curve = (firstGraceGroup as GraceNoteGroup).getRenderedSlurCurves()[0];
  const curveDirection = (firstGraceGroup as GraceNoteGroup).getSlurLayout()?.direction ?? 1;
  const curveMidpointY = (curve.start.y + 2 * curve.topControl.y + curve.end.y) / 4;
  const beamClearance =
    curveDirection === -1
      ? Math.min(curve.start.y, curve.end.y) - curveMidpointY
      : curveMidpointY - Math.max(curve.start.y, curve.end.y);
  options.assert.ok(curve.start.x < curve.end.x, 'slur follows the left-to-right musical order');
  options.assert.strictEqual(
    (firstGraceGroup as GraceNoteGroup).getSlurLayout()?.startAttachment,
    'notehead-center',
    'slur starts at the optical center of the first grace notehead'
  );
  options.assert.ok(
    Math.abs(curve.start.x - gracenotes0[0].getSelectedNoteHeadBounds(0).centerX) < 0.001,
    'slur onset uses the optical center of the first grace notehead'
  );
  options.assert.ok(beamClearance >= 5.9, 'a source-spanning grace slur clears the beamed grace notes');
  options.assert.deepEqual(
    (firstGraceGroup as GraceNoteGroup).getSlurLayout()?.intersectedEndpointIds,
    [],
    'slur does not cross either connected notehead'
  );
  options.assert.strictEqual(
    fourthGraceGroup.getSlur()?.getNotes().firstNote,
    gracenotes3[0],
    'the fourth-quarter slur includes every grace note in the group'
  );
  options.assert.strictEqual(
    fifthGraceGroup.getSlur()?.getNotes().firstNote,
    gracenotes4[0],
    'the fifth-quarter slur includes every grace note in the group'
  );
  options.assert.ok(
    graceNoteLeftEdge(gracenotes4[1]) - graceNoteRightEdge(gracenotes4[0]) >= 2 * StaveNote.minNoteheadPadding - 0.001,
    'the dotted fifth-quarter grace note leaves room before the next grace notehead'
  );

  const thirdCurve = thirdGraceGroup.getRenderedSlurCurves()[0];
  const thirdHeadBounds = thirdMainNote.noteHeads.map((noteHead) =>
    noteHead.getBoundingBoxAt(thirdMainNote.getNoteHeadBeginX())
  );
  const thirdChordLeft = Math.min(...thirdHeadBounds.map((bounds) => bounds.getX()));
  const thirdChordRightmostCenter = Math.max(...thirdHeadBounds.map((bounds) => bounds.getX() + bounds.getW() / 2));
  options.assert.ok(
    Math.abs(thirdCurve.end.x - thirdChordRightmostCenter) < 0.001,
    'the chord-ending slur attaches at the visual center of the rightmost chord note'
  );
  options.assert.notOk(
    curveIntersectsBounds(thirdCurve, {
      left: thirdHeadBounds[1].getX(),
      right: thirdHeadBounds[1].getX() + thirdHeadBounds[1].getW(),
      top: thirdHeadBounds[1].getY(),
      bottom: thirdHeadBounds[1].getY() + thirdHeadBounds[1].getH(),
    }),
    'the third-quarter slur clears the rightmost chord notehead'
  );

  const firstGraceSharp = gracenotes0[1].getModifiersByType(Accidental.CATEGORY)[0];
  const fourthGraceNatural = gracenotes3[2].getModifiersByType(Accidental.CATEGORY)[0];
  options.assert.ok(
    firstGraceSharp.getBoundingBox().getX() - graceNoteRightEdge(gracenotes0[0]) <=
      StaveNote.minNoteheadPadding + 0.001,
    'the first-quarter grace sharp does not add unnecessary leading whitespace'
  );
  options.assert.ok(
    fourthGraceNatural.getBoundingBox().getX() - graceNoteRightEdge(gracenotes3[1]) <=
      StaveNote.minNoteheadPadding + 0.001,
    'the fourth-quarter grace natural does not add unnecessary leading whitespace'
  );
  const minimumGraceGroupEndGap = 1.5 * StaveNote.minNoteheadPadding - 0.001;
  options.assert.ok(
    noteheadLeftEdge(notes[0]) - graceNoteRightEdge(gracenotes0[gracenotes0.length - 1]) >= minimumGraceGroupEndGap,
    'the first-quarter grace group leaves a small end gap before the parent notehead'
  );
  options.assert.ok(
    noteheadLeftEdge(fourthMainNote) - graceNoteRightEdge(gracenotes3[gracenotes3.length - 1]) >=
      minimumGraceGroupEndGap,
    'the fourth-quarter grace group leaves a small end gap before the parent notehead'
  );
  options.assert.ok(
    noteheadLeftEdge(fifthMainNote) - graceNoteRightEdge(gracenotes4[gracenotes4.length - 1]) >=
      minimumGraceGroupEndGap,
    'the fifth-quarter grace group leaves a small end gap before the parent notehead'
  );

  const secondAccidentalBounds = secondAccidental.getBoundingBox();
  const secondGraceRight = graceNoteRightEdge(gracenotes1[0]);
  options.assert.ok(
    secondAccidentalBounds.getX() - secondGraceRight <= 1.001,
    'the grace group uses compact spacing before the parent accidental'
  );
  const secondAccidentalRect = {
    left: secondAccidentalBounds.getX(),
    right: secondAccidentalBounds.getX() + secondAccidentalBounds.getW(),
    top: secondAccidentalBounds.getY(),
    bottom: secondAccidentalBounds.getY() + secondAccidentalBounds.getH(),
  };
  options.assert.notOk(
    secondGraceGroup.getRenderedSlurCurves().some((curve) => curveIntersectsBounds(curve, secondAccidentalRect)),
    'the second-quarter slur clears the parent accidental'
  );
  options.assert.ok(
    thirdChordLeft - graceNoteRightEdge(gracenotes2[0]) >= StaveNote.minNoteheadPadding - 0.001,
    'the third-quarter grace flag clears the chord'
  );
  options.assert.strictEqual(
    (steepGraceGroup as GraceNoteGroup).getSlurLayout()?.direction,
    -1,
    'a high grace note on a large descending leap routes its slur above'
  );
  const steepLayout = (steepGraceGroup as GraceNoteGroup).getSlurLayout();
  const steepCurve = steepLayout?.curves[0];
  options.assert.strictEqual(steepLayout?.startAttachment, 'stem-tip', 'steep slur starts at grace stem tip');
  options.assert.strictEqual(steepLayout?.endAttachment, 'stem-tip', 'steep slur ends at main stem tip');
  options.assert.ok(
    Math.abs((steepCurve?.start.x ?? 0) - steepGraceNotes[0].getStemX()) < 0.001,
    'steep slur starts at the grace stem x position'
  );
  options.assert.ok(
    Math.abs((steepCurve?.end.x ?? 0) - steepMainNote.getStemX()) < 0.001,
    'steep slur ends at the main stem x position'
  );
  options.assert.ok(
    Math.abs((steepCurve?.start.y ?? 0) - steepGraceNotes[0].getStemExtents().topY) < 0.001,
    'steep slur starts at the grace stem tip y position'
  );
  options.assert.ok(
    Math.abs((steepCurve?.end.y ?? 0) - steepMainNote.getStemExtents().topY) < 0.001,
    'steep slur ends at the main stem tip y position'
  );
  const steepEndpointSeparation = Math.abs((steepCurve?.end.y ?? 0) - (steepCurve?.start.y ?? 0));
  const steepControlClearance =
    steepLayout?.direction === -1
      ? ((steepCurve?.start.y ?? 0) + (steepCurve?.end.y ?? 0)) / 2 - (steepCurve?.topControl.y ?? 0)
      : (steepCurve?.topControl.y ?? 0) - ((steepCurve?.start.y ?? 0) + (steepCurve?.end.y ?? 0)) / 2;
  options.assert.ok(
    steepControlClearance >= steepEndpointSeparation / 2 - 0.001,
    'steep slur curvature scales with endpoint separation'
  );
}

/**
 * Helper function for three tests below: stem, stemWithBeamed, slash.
 */
const createNoteForStemTest = (
  duration: string,
  noteBuilder: NoteBuilder,
  keys: string[],
  stemDirection: number,
  slash: boolean = false
): StaveNote => {
  const struct: GraceNoteStruct | StaveNoteStruct = { duration, slash };
  struct.stemDirection = stemDirection;
  struct.keys = keys;
  return noteBuilder(struct);
};

// A NoteBuilder is one of two functions: Factory.StaveNote | Factory.GraceNote.
type NoteBuilder = InstanceType<typeof Factory>['StaveNote'] | InstanceType<typeof Factory>['GraceNote'];

// Used in three tests below.
const durationsForStemTest = ['8', '16', '32', '64', '128'];

function stem(options: TestOptions): void {
  const f = VexFlowTests.makeFactory(options, 700, 130);
  const stave = f.Stave({ x: 10, y: 10, width: 650 });

  function createNotes(noteBuilder: NoteBuilder, keys: string[], stemDirection: number) {
    return durationsForStemTest.map((duration) => createNoteForStemTest(duration, noteBuilder, keys, stemDirection));
  }

  function createNoteBlock(keys: string[], stemDirection: number) {
    const staveNotes = createNotes(f.StaveNote.bind(f), keys, stemDirection);
    const gracenotes = createNotes(f.GraceNote.bind(f), keys, stemDirection);
    // Add a bunch of GraceNotes in front of the first StaveNote.
    staveNotes[0].addModifier(f.GraceNoteGroup({ notes: gracenotes }), 0);
    return staveNotes;
  }

  const voice = f.Voice().setStrict(false);
  voice.addTickables(createNoteBlock(['g/4'], 1));
  voice.addTickables(createNoteBlock(['d/5'], -1));

  f.Formatter().joinVoices([voice]).formatToStave([voice], stave);

  f.draw();

  options.assert.ok(true, 'GraceNoteStem');
}

function stemWithBeamed(options: TestOptions): void {
  const f = VexFlowTests.makeFactory(options, 700, 130);
  const stave = f.Stave({ x: 10, y: 10, width: 650 });

  function createBeamedNotes(
    noteBuilder: NoteBuilder,
    keys: string[],
    stemDirection: number,
    beams: Beam[],
    isGrace = false,
    notesToBeam?: StaveNote[][]
  ) {
    const ret: StaveNote[] = [];
    durationsForStemTest.map((duration) => {
      const n0 = createNoteForStemTest(duration, noteBuilder, keys, stemDirection);
      const n1 = createNoteForStemTest(duration, noteBuilder, keys, stemDirection);
      ret.push(n0);
      ret.push(n1);
      if (notesToBeam) {
        notesToBeam.push([n0, n1]);
      }
      if (!isGrace) {
        beams.push(f.Beam({ notes: [n0, n1] }));
      }
    });
    return ret;
  }

  function createBeamedNoteBlock(keys: string[], stemDirection: number, beams: Beam[]) {
    const bnotes = createBeamedNotes(f.StaveNote.bind(f), keys, stemDirection, beams);
    const notesToBeam: StaveNote[][] = [];
    const gracenotes = createBeamedNotes(f.GraceNote.bind(f), keys, stemDirection, beams, true, notesToBeam);
    const graceNoteGroup = f.GraceNoteGroup({ notes: gracenotes });
    notesToBeam.map(graceNoteGroup.beamNotes.bind(graceNoteGroup));
    bnotes[0].addModifier(graceNoteGroup, 0);
    return bnotes;
  }

  const beams: Beam[] = [];
  const voice = f.Voice().setStrict(false);
  voice.addTickables(createBeamedNoteBlock(options.params.keys1, options.params.stemDirection1, beams));
  voice.addTickables(createBeamedNoteBlock(options.params.keys2, options.params.stemDirection2, beams));

  f.Formatter().joinVoices([voice]).formatToStave([voice], stave);

  f.draw();

  options.assert.ok(true, 'GraceNoteStem');
}

function slash(options: TestOptions): void {
  const f = VexFlowTests.makeFactory(options, 700, 130);
  const stave = f.Stave({ x: 10, y: 10, width: 650 });

  function createNotes(noteT: typeof f.GraceNote, keys: string[], stemDirection: number, slash: boolean) {
    return durationsForStemTest.map((d) => createNoteForStemTest(d, noteT, keys, stemDirection, slash));
  }

  function createNoteBlock(keys: string[], stemDirection: number) {
    const notes = [f.StaveNote({ keys: ['f/4'], stemDirection, duration: '16' })];
    let graceNotes = createNotes(f.GraceNote.bind(f), keys, stemDirection, true) as GraceNote[];

    const duration = '8';
    const gns = [
      { keys: ['d/4', 'a/4'], stemDirection, duration, slash: true },
      { keys: ['d/4', 'a/4'], stemDirection, duration, slash: true },
      { keys: ['d/4', 'a/4'], stemDirection, duration, slash: true },

      { keys: ['e/4', 'a/4'], stemDirection, duration, slash: true },
      { keys: ['e/4', 'a/4'], stemDirection, duration, slash: true },
      { keys: ['b/4', 'f/5'], stemDirection, duration, slash: true },

      { keys: ['b/4', 'f/5'], stemDirection, duration, slash: true },
      { keys: ['b/4', 'f/5'], stemDirection, duration, slash: true },
      { keys: ['e/4', 'a/4'], stemDirection, duration, slash: true },
    ].map(f.GraceNote.bind(f));

    const notesToBeam = [];
    notesToBeam.push([gns[0], gns[1], gns[2]]);
    notesToBeam.push([gns[3], gns[4], gns[5]]);
    notesToBeam.push([gns[6], gns[7], gns[8]]);

    // Merge the two GraceNote[].
    graceNotes = graceNotes.concat(gns);
    const graceNoteGroup = f.GraceNoteGroup({ notes: graceNotes });
    notesToBeam.forEach((notes) => graceNoteGroup.beamNotes(notes));

    notes[0].addModifier(graceNoteGroup, 0);
    return notes;
  }

  const voice = f.Voice().setStrict(false);
  voice.addTickables(createNoteBlock(['d/4', 'a/4'], 1));
  voice.addTickables(createNoteBlock(['d/4', 'a/4'], -1));

  f.Formatter().joinVoices([voice]).formatToStave([voice], stave);

  f.draw();

  options.assert.ok(true, 'GraceNoteSlash');
}

function slashWithBeams(options: TestOptions): void {
  const f = VexFlowTests.makeFactory(options, 800, 130);
  const stave = f.Stave({ x: 10, y: 10, width: 750 });

  function createNoteBlock(keys: string[], stemDirection: number) {
    const notes = [f.StaveNote({ keys: ['f/4'], stemDirection, duration: '16' })];
    let allGraceNotes: GraceNote[] = [];

    const graceNotesToBeam: GraceNote[][] = [];

    ['8', '16', '32', '64'].forEach(function (duration) {
      const graceNotes = [
        { keys: ['d/4', 'a/4'], stemDirection, duration, slash: true },
        { keys: ['d/4', 'a/4'], stemDirection, duration, slash: false },

        { keys: ['e/4', 'a/4'], stemDirection, duration, slash: true },
        { keys: ['b/4', 'f/5'], stemDirection, duration, slash: false },

        { keys: ['b/4', 'f/5'], stemDirection, duration, slash: true },
        { keys: ['e/4', 'a/4'], stemDirection, duration, slash: false },
      ].map(f.GraceNote.bind(f));

      graceNotesToBeam.push([graceNotes[0], graceNotes[1]]);
      graceNotesToBeam.push([graceNotes[2], graceNotes[3]]);
      graceNotesToBeam.push([graceNotes[4], graceNotes[5]]);
      allGraceNotes = allGraceNotes.concat(graceNotes);
    });
    const graceNoteGroup = f.GraceNoteGroup({ notes: allGraceNotes });

    graceNotesToBeam.forEach((g) => graceNoteGroup.beamNotes(g));

    notes[0].addModifier(graceNoteGroup, 0);
    return notes;
  }

  const voice = f.Voice().setStrict(false);
  voice.addTickables(createNoteBlock(['d/4', 'a/4'], 1));
  voice.addTickables(createNoteBlock(['d/4', 'a/4'], -1));

  f.Formatter().joinVoices([voice]).formatToStave([voice], stave);

  f.draw();

  options.assert.ok(true, 'GraceNoteSlashWithBeams');
}

function multipleVoices(options: TestOptions): void {
  const f = VexFlowTests.makeFactory(options, 450, 140);
  const stave = f.Stave({ x: 10, y: 10, width: 450 });

  const notes = [
    { keys: ['f/5'], stemDirection: 1, duration: '16' },
    { keys: ['f/5'], stemDirection: 1, duration: '16' },
    { keys: ['d/5'], stemDirection: 1, duration: '16' },
    { keys: ['c/5'], stemDirection: 1, duration: '16' },
    { keys: ['c/5'], stemDirection: 1, duration: '16' },
    { keys: ['d/5'], stemDirection: 1, duration: '16' },
    { keys: ['f/5'], stemDirection: 1, duration: '16' },
    { keys: ['e/5'], stemDirection: 1, duration: '16' },
  ].map(f.StaveNote.bind(f));

  const notes2 = [
    { keys: ['f/4'], stemDirection: -1, duration: '16' },
    { keys: ['e/4'], stemDirection: -1, duration: '16' },
    { keys: ['d/4'], stemDirection: -1, duration: '16' },
    { keys: ['c/4'], stemDirection: -1, duration: '16' },
    { keys: ['c/4'], stemDirection: -1, duration: '16' },
    { keys: ['d/4'], stemDirection: -1, duration: '16' },
    { keys: ['f/4'], stemDirection: -1, duration: '16' },
    { keys: ['e/4'], stemDirection: -1, duration: '16' },
  ].map(f.StaveNote.bind(f));

  const gracenotes1 = [{ keys: ['b/4'], stemDirection: 1, duration: '8', slash: true }].map(f.GraceNote.bind(f));

  const gracenotes2 = [{ keys: ['f/4'], stemDirection: -1, duration: '8', slash: true }].map(f.GraceNote.bind(f));

  const gracenotes3 = [
    { keys: ['f/4'], duration: '32', stemDirection: -1 },
    { keys: ['e/4'], duration: '32', stemDirection: -1 },
  ].map(f.GraceNote.bind(f));

  const gracenotes4 = [
    { keys: ['f/5'], duration: '32', stemDirection: 1 },
    { keys: ['e/5'], duration: '32', stemDirection: 1 },
    { keys: ['e/5'], duration: '8', stemDirection: 1 },
  ].map(f.GraceNote.bind(f));

  gracenotes2[0].setStemDirection(-1);
  gracenotes2[0].addModifier(f.Accidental({ type: '#' }), 0);

  notes[1].addModifier(f.GraceNoteGroup({ notes: gracenotes4 }).beamNotes(), 0);
  notes[3].addModifier(f.GraceNoteGroup({ notes: gracenotes1 }), 0);
  notes2[1].addModifier(f.GraceNoteGroup({ notes: gracenotes2 }).beamNotes(), 0);
  notes2[5].addModifier(f.GraceNoteGroup({ notes: gracenotes3 }).beamNotes(), 0);

  const voice = f.Voice().setStrict(false).addTickables(notes);

  const voice2 = f.Voice().setStrict(false).addTickables(notes2);

  f.Beam({ notes: notes.slice(0, 4) });
  f.Beam({ notes: notes.slice(4, 8) });
  f.Beam({ notes: notes2.slice(0, 4) });
  f.Beam({ notes: notes2.slice(4, 8) });

  f.Formatter().joinVoices([voice, voice2]).formatToStave([voice, voice2], stave);

  f.draw();

  options.assert.ok(true, 'Sixteenth Test');
}

function multipleVoicesMultipleDraws(options: TestOptions): void {
  const f = VexFlowTests.makeFactory(options, 450, 140);
  const stave = f.Stave({ x: 10, y: 10, width: 450 });

  const notes = [
    { keys: ['f/5'], stemDirection: 1, duration: '16' },
    { keys: ['f/5'], stemDirection: 1, duration: '16' },
    { keys: ['d/5'], stemDirection: 1, duration: '16' },
    { keys: ['c/5'], stemDirection: 1, duration: '16' },
    { keys: ['c/5'], stemDirection: 1, duration: '16' },
    { keys: ['d/5'], stemDirection: 1, duration: '16' },
    { keys: ['f/5'], stemDirection: 1, duration: '16' },
    { keys: ['e/5'], stemDirection: 1, duration: '16' },
  ].map(f.StaveNote.bind(f));

  const notes2 = [
    { keys: ['f/4'], stemDirection: -1, duration: '16' },
    { keys: ['e/4'], stemDirection: -1, duration: '16' },
    { keys: ['d/4'], stemDirection: -1, duration: '16' },
    { keys: ['c/4'], stemDirection: -1, duration: '16' },
    { keys: ['c/4'], stemDirection: -1, duration: '16' },
    { keys: ['d/4'], stemDirection: -1, duration: '16' },
    { keys: ['f/4'], stemDirection: -1, duration: '16' },
    { keys: ['e/4'], stemDirection: -1, duration: '16' },
  ].map(f.StaveNote.bind(f));

  const gracenotes1 = [{ keys: ['b/4'], stemDirection: 1, duration: '8', slash: true }].map(f.GraceNote.bind(f));

  const gracenotes2 = [{ keys: ['f/4'], stemDirection: -1, duration: '8', slash: true }].map(f.GraceNote.bind(f));

  const gracenotes3 = [
    { keys: ['f/4'], duration: '32', stemDirection: -1 },
    { keys: ['e/4'], duration: '32', stemDirection: -1 },
  ].map(f.GraceNote.bind(f));

  const gracenotes4 = [
    { keys: ['f/5'], duration: '32', stemDirection: 1 },
    { keys: ['e/5'], duration: '32', stemDirection: 1 },
    { keys: ['e/5'], duration: '8', stemDirection: 1 },
  ].map(f.GraceNote.bind(f));

  gracenotes2[0].setStemDirection(-1);
  gracenotes2[0].addModifier(f.Accidental({ type: '#' }), 0);

  notes[1].addModifier(f.GraceNoteGroup({ notes: gracenotes4 }).beamNotes(), 0);
  notes[3].addModifier(f.GraceNoteGroup({ notes: gracenotes1 }), 0);
  notes2[1].addModifier(f.GraceNoteGroup({ notes: gracenotes2 }).beamNotes(), 0);
  notes2[5].addModifier(f.GraceNoteGroup({ notes: gracenotes3 }).beamNotes(), 0);

  const voice = f.Voice().setStrict(false).addTickables(notes);

  const voice2 = f.Voice().setStrict(false).addTickables(notes2);

  f.Beam({ notes: notes.slice(0, 4) });
  f.Beam({ notes: notes.slice(4, 8) });
  f.Beam({ notes: notes2.slice(0, 4) });
  f.Beam({ notes: notes2.slice(4, 8) });

  f.Formatter().joinVoices([voice, voice2]).formatToStave([voice, voice2], stave);

  f.draw();
  f.draw();

  options.assert.ok(true, 'Seventeenth Test');
}

VexFlowTests.register(GraceNoteTests);
export { GraceNoteTests };
