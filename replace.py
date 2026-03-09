import re

with open("src/pages/TechniquePage.tsx", "r") as f:
    content = f.read()

# Pattern 1
old_pattern_1 = """                  <div>
                    <label className="text-xs text-green-700 font-medium">✅ Points Positifs</label>
                    <Textarea
                      disabled={disabled || isNego}
                      className={`min-h-[60px] text-sm border-green-200 ${isNego ? 'opacity-60' : ''}`}
                      rows={3}
                      value={note?.commentPositif ?? ""}
                      onChange={(e) =>
                        setTechnicalNote(companyId, criterion.id, sub.id, note?.notation ?? null, note?.comment ?? "", e.target.value, undefined, versionId)
                      }
                      placeholder="Points positifs…"
                      maxLength={2000}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-red-600 font-medium">❌ Points Négatifs</label>
                    <Textarea
                      disabled={disabled || isNego}
                      className={`min-h-[60px] text-sm border-red-200 ${isNego ? 'opacity-60' : ''}`}
                      rows={3}
                      value={note?.commentNegatif ?? ""}
                      onChange={(e) =>
                        setTechnicalNote(companyId, criterion.id, sub.id, note?.notation ?? null, note?.comment ?? "", undefined, e.target.value, versionId)
                      }
                      placeholder="Points négatifs…"
                      maxLength={2000}
                    />
                  </div>
                  {isNego && (
                    <div>
                      <label className="text-xs text-blue-600 font-medium">💬 Réponses aux questions</label>
                      <Textarea
                        disabled={disabled}
                        className="min-h-[60px] text-sm border-blue-200"
                        rows={3}
                        value={note?.questionResponse ?? ""}
                        onChange={(e) =>
                          setTechnicalNoteResponse(companyId, criterion.id, sub.id, e.target.value, versionId)
                        }
                        placeholder="Réponses du candidat aux questions posées…"
                      />
                    </div>
                  )}"""

new_pattern_1 = """                  {isNego && (
                    <>
                      <div>
                        <label className="text-xs text-green-700 font-medium">✅ Points Positifs (Phase précédente)</label>
                        <Textarea
                          disabled={true}
                          className="min-h-[60px] text-sm border-green-200 opacity-60 bg-muted"
                          rows={3}
                          value={getPrevNote(sub.id)?.commentPositif ?? ""}
                          placeholder="Points positifs…"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-red-600 font-medium">❌ Points Négatifs (Phase précédente)</label>
                        <Textarea
                          disabled={true}
                          className="min-h-[60px] text-sm border-red-200 opacity-60 bg-muted"
                          rows={3}
                          value={getPrevNote(sub.id)?.commentNegatif ?? ""}
                          placeholder="Points négatifs…"
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="text-xs text-green-700 font-medium">
                      ✅ Points Positifs{isNego ? " (Phase courante)" : ""}
                    </label>
                    <Textarea
                      disabled={disabled}
                      className="min-h-[60px] text-sm border-green-200"
                      rows={3}
                      value={note?.commentPositif ?? ""}
                      onChange={(e) =>
                        setTechnicalNote(companyId, criterion.id, sub.id, note?.notation ?? null, note?.comment ?? "", e.target.value, undefined, versionId)
                      }
                      placeholder="Points positifs…"
                      maxLength={2000}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-red-600 font-medium">
                      ❌ Points Négatifs{isNego ? " (Phase courante)" : ""}
                    </label>
                    <Textarea
                      disabled={disabled}
                      className="min-h-[60px] text-sm border-red-200"
                      rows={3}
                      value={note?.commentNegatif ?? ""}
                      onChange={(e) =>
                        setTechnicalNote(companyId, criterion.id, sub.id, note?.notation ?? null, note?.comment ?? "", undefined, e.target.value, versionId)
                      }
                      placeholder="Points négatifs…"
                      maxLength={2000}
                    />
                  </div>"""


old_pattern_2 = """            <div>
              <label className="text-xs text-green-700 font-medium">✅ Points Positifs</label>
              <Textarea
              disabled={disabled || isNego}
              className={`min-h-[60px] text-sm border-green-200 ${isNego ? 'opacity-60' : ''}`}
              rows={3}
              value={note?.commentPositif ?? ""}
              onChange={(e) =>
                setTechnicalNote(companyId, criterion.id, undefined, note?.notation ?? null, note?.comment ?? "", e.target.value, undefined, versionId)
              }
              placeholder="Points positifs…"
              maxLength={2000}
              />
            </div>
            <div>
              <label className="text-xs text-red-600 font-medium">❌ Points Négatifs</label>
              <Textarea
                disabled={disabled || isNego}
                className={`min-h-[60px] text-sm border-red-200 ${isNego ? 'opacity-60' : ''}`}
                rows={3}
                value={note?.commentNegatif ?? ""}
                onChange={(e) =>
                  setTechnicalNote(companyId, criterion.id, undefined, note?.notation ?? null, note?.comment ?? "", undefined, e.target.value, versionId)
                }
                placeholder="Points négatifs…"
                maxLength={2000}
              />
            </div>
            {isNego && (
              <div>
                <label className="text-xs text-blue-600 font-medium">💬 Réponses aux questions</label>
                <Textarea
                  disabled={disabled}
                  className="min-h-[60px] text-sm border-blue-200"
                  rows={3}
                  value={note?.questionResponse ?? ""}
                  onChange={(e) =>
                    setTechnicalNoteResponse(companyId, criterion.id, undefined, e.target.value, versionId)
                  }
                  placeholder="Réponses du candidat aux questions posées…"
                />
              </div>
            )}"""

new_pattern_2 = """            {isNego && (
              <>
                <div>
                  <label className="text-xs text-green-700 font-medium">✅ Points Positifs (Phase précédente)</label>
                  <Textarea
                    disabled={true}
                    className="min-h-[60px] text-sm border-green-200 opacity-60 bg-muted"
                    rows={3}
                    value={getPrevNote()?.commentPositif ?? ""}
                    placeholder="Points positifs…"
                  />
                </div>
                <div>
                  <label className="text-xs text-red-600 font-medium">❌ Points Négatifs (Phase précédente)</label>
                  <Textarea
                    disabled={true}
                    className="min-h-[60px] text-sm border-red-200 opacity-60 bg-muted"
                    rows={3}
                    value={getPrevNote()?.commentNegatif ?? ""}
                    placeholder="Points négatifs…"
                  />
                </div>
              </>
            )}
            <div>
              <label className="text-xs text-green-700 font-medium">
                ✅ Points Positifs{isNego ? " (Phase courante)" : ""}
              </label>
              <Textarea
                disabled={disabled}
                className="min-h-[60px] text-sm border-green-200"
                rows={3}
                value={note?.commentPositif ?? ""}
                onChange={(e) =>
                  setTechnicalNote(companyId, criterion.id, undefined, note?.notation ?? null, note?.comment ?? "", e.target.value, undefined, versionId)
                }
                placeholder="Points positifs…"
                maxLength={2000}
              />
            </div>
            <div>
              <label className="text-xs text-red-600 font-medium">
                ❌ Points Négatifs{isNego ? " (Phase courante)" : ""}
              </label>
              <Textarea
                disabled={disabled}
                className="min-h-[60px] text-sm border-red-200"
                rows={3}
                value={note?.commentNegatif ?? ""}
                onChange={(e) =>
                  setTechnicalNote(companyId, criterion.id, undefined, note?.notation ?? null, note?.comment ?? "", undefined, e.target.value, versionId)
                }
                placeholder="Points négatifs…"
                maxLength={2000}
              />
            </div>"""

if old_pattern_1 in content:
    content = content.replace(old_pattern_1, new_pattern_1)
    print("Replaced pattern 1")
else:
    print("Pattern 1 not found!")
    
if old_pattern_2 in content:
    content = content.replace(old_pattern_2, new_pattern_2)
    print("Replaced pattern 2")
else:
    print("Pattern 2 not found!")

with open("src/pages/TechniquePage.tsx", "w") as f:
    f.write(content)

