// A tiny in-memory stand-in for a Mongoose model: enough of find / findOne /
// create / update / delete (with the chainable query bits the staff code uses)
// to run real controllers and middleware without a database.
import crypto from "node:crypto";
import bcrypt from "bcrypt";

const newId = () => crypto.randomBytes(12).toString("hex");
const sameId = (a, b) => String(a) === String(b);

function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === "$or") return cond.some((f) => matches(doc, f));
    if (key === "$and") return cond.every((f) => matches(doc, f));
    const value = doc[key];
    if (cond instanceof RegExp) return cond.test(String(value ?? ""));
    if (cond && typeof cond === "object" && !(cond instanceof Date) && !Array.isArray(cond)) {
      return Object.entries(cond).every(([op, arg]) => {
        if (op === "$gte") return value >= arg;
        if (op === "$lte") return value <= arg;
        if (op === "$gt") return value > arg;
        if (op === "$in") return arg.some((a) => sameId(a, value));
        if (op === "$type") return typeof value === "string";
        return false;
      });
    }
    return sameId(value, cond);
  });
}

export function makeFakeModel(name, { onSave, passwords = false, defaults = {} } = {}) {
  const rows = [];

  const wrap = (row) => {
    const doc = Object.create(null);
    Object.assign(doc, row);
    Object.defineProperty(doc, "_row", { value: row, enumerable: false });
    Object.defineProperty(doc, "toObject", { enumerable: false, value: () => ({ ...doc._row, ...Object.fromEntries(Object.entries(doc)) }) });
    Object.defineProperty(doc, "markModified", { enumerable: false, value: () => {} });
    Object.defineProperty(doc, "save", {
      enumerable: false,
      value: async () => {
        if (passwords && doc.password && !String(doc.password).startsWith("$2")) doc.password = bcrypt.hashSync(doc.password, 4);
        if (onSave) await onSave(doc, rows);
        Object.assign(row, Object.fromEntries(Object.entries(doc)));
        return doc;
      },
    });
    if (passwords) {
      Object.defineProperty(doc, "comparePassword", { enumerable: false, value: (p) => bcrypt.compare(String(p), String(doc.password)) });
    }
    return doc;
  };

  const query = (getRows, { asDoc }) => {
    let list = null;
    const q = {
      _sort: null, _skip: 0, _limit: Infinity, _lean: false,
      sort(spec) { q._sort = spec; return q; },
      skip(n) { q._skip = n; return q; },
      limit(n) { q._limit = n; return q; },
      select() { return q; },
      lean() { q._lean = true; return q; },
      then(resolve, reject) {
        try {
          list = getRows().map((r) => ({ ...r }));
          if (q._sort) {
            const [[field, dir]] = Object.entries(q._sort);
            list.sort((a, b) => (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0) * (dir < 0 ? -1 : 1));
          }
          list = list.slice(q._skip, q._skip + q._limit);
          const out = asDoc(list, q._lean);
          return Promise.resolve(out).then(resolve, reject);
        } catch (e) {
          return Promise.reject(e).then(resolve, reject);
        }
      },
    };
    return q;
  };

  const model = {
    name,
    rows,
    seed(data) {
      const row = { _id: newId(), createdAt: new Date(), ...structuredClone(defaults), ...data };
      if (passwords && row.password && !String(row.password).startsWith("$2")) row.password = bcrypt.hashSync(row.password, 4);
      rows.push(row);
      return row;
    },
    reset() { rows.length = 0; },
    async create(data) {
      const list = Array.isArray(data) ? data : [data];
      const made = [];
      for (const d of list) {
        const row = { _id: newId(), createdAt: new Date(), ...structuredClone(defaults), ...d };
        const doc = wrap(row);
        await doc.save(); // runs hashing + the model's own checks (e.g. duplicates)
        rows.push(row);
        made.push(doc);
      }
      return Array.isArray(data) ? made : made[0];
    },
    find: (filter) => query(() => rows.filter((r) => matches(r, filter)), { asDoc: (list, lean) => (lean ? list : list.map((r) => wrap(rows.find((x) => sameId(x._id, r._id))))) }),
    findOne: (filter) => query(() => rows.filter((r) => matches(r, filter)).slice(0, 1), { asDoc: (list, lean) => (list[0] ? (lean ? list[0] : wrap(rows.find((x) => sameId(x._id, list[0]._id)))) : null) }),
    findById: (id) => model.findOne({ _id: id }),
    async countDocuments(filter) { return rows.filter((r) => matches(r, filter)).length; },
    async exists(filter) { const r = rows.find((x) => matches(x, filter)); return r ? { _id: r._id } : null; },
    async updateOne(filter, update) {
      const row = rows.find((r) => matches(r, filter));
      if (row && update.$set) Object.assign(row, update.$set);
      return { matchedCount: row ? 1 : 0 };
    },
    async updateMany(filter, update) {
      rows.filter((r) => matches(r, filter)).forEach((r) => update.$set && Object.assign(r, update.$set));
      return {};
    },
    async findOneAndDelete(filter) {
      const i = rows.findIndex((r) => matches(r, filter));
      return i < 0 ? null : rows.splice(i, 1)[0];
    },
  };
  return model;
}
