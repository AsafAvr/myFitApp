import type { ClassId, SkillId } from '../../types';
import type { ClassDef, SkillDef } from '../skills';
import { WARDEN } from './warden';
import { EMBERWRIGHT } from './emberwright';
import { STRIDER } from './strider';

export const CLASSES: Record<ClassId, ClassDef> = { warden: WARDEN, emberwright: EMBERWRIGHT, strider: STRIDER };
export const CLASS_LIST: ClassDef[] = [WARDEN, EMBERWRIGHT, STRIDER];

const skillIndex = new Map<SkillId, SkillDef>();
for (const c of CLASS_LIST) for (const s of c.skills) {
  if (skillIndex.has(s.id)) throw new Error(`Skill id "${s.id}" is used twice`);
  skillIndex.set(s.id, s);
}

export const skillDef = (id: SkillId): SkillDef | undefined => skillIndex.get(id);
