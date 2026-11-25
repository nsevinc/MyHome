import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Armchair, Box, ChevronDown, CircleHelp, Columns2, Download, FileDown, FileUp, Film, Footprints,
  Grid2X2, House, Layers3, Magnet, Minus, Palette, PencilRuler, Plus, Redo2, Ruler, ScanLine, Trash2, Undo2 } from 'lucide-react'
import { DrawDialog } from './DrawDialog'
import { Inspector } from './Inspector'
import type { InspectorReviewFocus } from './Inspector'
import { PlanCanvas } from './PlanCanvas'
import { WallElevation } from './WallElevation'
import { addFurnitureCopy, wallCopyPreview, wallMovePreview, wallSymmetryPreview } from './wall-mount-edit'
import { adjacentCopies } from './adjacent-copy'
import type { CopyControls, CopySide } from './adjacent-copy'
import type { MountAxis, MountCopy, MountSymmetry } from './wall-mount-edit'
import { mountSymmetryRuleConflict, resolveMountSymmetries } from './mount-symmetry-rules'
import type { MountSymmetryChanges } from './mount-symmetry-rules'
import { SymmetryRangeSearch } from './SymmetryRangeSearch'
import { keepMountSymmetries } from './mount-symmetry-data'
import { keepExistingClearances } from './keep-clear-data'
import type { WidthEdit } from './wardrobe-rebalance'
import { electricalReadings } from './electrical-points'
import type { ElectricalReading } from './electrical-points'
import { SectionView } from './SectionView'
import { sectionMark, sectionOffset } from './room-section'
import { itemSelection, removeSelectedFurniture, selectedItemIds, toggleItemSelection } from './selection'
import type { Selection } from './selection'
import { importModel, makeCatalogFurniture, modelCatalog } from './catalog'
import { bounds, furnitureVolumes, initialPlacement, pointInRoom, roomEdges, trimContacts, validateProject, vertices, wallMountPose } from './geometry'
import { replaceFurniture } from './group-placement'
import { fmt, makeCurtain, makeMountedFurniture, makeProject, maxMeasurements, maxMountSymmetries, maxWallRegions, uid } from './model'
import type { Furniture, FurnitureLink, MountedKind, Point, Project, RoomSection, View, WallCovering, WallRegion } from './model'
import type { ElectricalPoint } from './model'
import { download, projectFilename, readProject } from './storage'
import { activateProject, exportArchive, initialProjectId, maxBackupBytes, newArchiveProject, openLocalProject, restoreArchive,
  saveLocalProject } from './project-archive'
import type { OpenProject, Revision } from './project-archive'
import { renderFixtureStates } from './lighting'
import { FurnitureLibrary, LibraryCategory, libraryDimensions, ModelCard } from './FurnitureLibrary'
import { PersonalModelPreview } from './PersonalModelPreview'
import { RoomItemList } from './RoomItemList'
import { focusFurniture } from './room-item-view'
import type { FurnitureFocus } from './room-item-view'
import { duplicateLayout, editLayoutItems, layoutName, layoutScene, renameLayout, switchLayout } from './layout-variants'
import type { LayoutPair } from './layout-variants'
import { activeDesign, designName, designScene, dropUnusedDesignItems, duplicateDesign, editDesignItem, findDesign,
  editDesignSurface, removeDesign, renameDesign, saveDesignPresentation, selectDesign } from './design-variants'
import type { DesignRenderSelection } from './DesignDialog'
import { replaceWallCovering } from './wall-coverings'
import { copyBaseboard, paintArchitecturalSurface } from './wall-trim'
import { previewTrimClearance } from './trim-placement'
import { TrimClearanceControls } from './TrimClearanceControls'
import { editPersonalModels, makePersonalFurniture, personalModelFrom, readPersonalModels } from './personal-library'
import type { PersonalModel } from './personal-library'
import { saveProjectPng } from './project-images'
import { sameCamera } from './camera-pose'
import { announceSceneJobs } from './scene-queue'
import { motionParts, motionTrial, solveMotion } from './furniture-motion'
import type { TrialSelection } from './furniture-motion'
import type { ReviewTarget } from './mounting-review'
import type { TransportOrientation } from './wardrobe-assembly'
import { savedMeasurements } from './measurements'
import type { PlacementSuggestion } from './placement-search'
import type { HelpTopic } from './HelpDialog'
import { removeMissingLinks } from './furniture-links'
import { emptyRoomProject } from './empty-room'
import { linkedItemsChanged, resolveLinkedPlacement } from './linked-placement'
import type { LinkedPreview } from './linked-placement'
import type { ReplacementPreview } from './furniture-replacement'
import { bedroomCatalog, makeBedroomFurniture } from './bedroom-catalog'
import { saveBedroomAlternative, suggestBedroomWall } from './bedroom-design'
import type { BedroomModel } from './model'
import { reconcileUpperRows } from './upper-cabinet-row'
import type { RowEdit } from './UpperRowDialog'

const Scene = lazy(() => import('./Scene'))
const RenderStudio = lazy(() => import('./RenderStudio'))
const LayoutDialog = lazy(() => import('./LayoutDialog').then(module => ({ default: module.LayoutDialog })))
const DesignDialog = lazy(() => import('./DesignDialog').then(module => ({ default: module.DesignDialog })))
const InstallationDialog = lazy(() => import('./InstallationDialog').then(module => ({ default: module.InstallationDialog })))
const MountingReviewDialog = lazy(() => import('./MountingReviewDialog').then(module => ({ default: module.MountingReviewDialog })))
const DeliveryPackageDialog = lazy(() => import('./DeliveryPackageDialog').then(module => ({ default: module.DeliveryPackageDialog })))
const TransportPathDialog = lazy(() => import('./TransportPathDialog').then(module => ({ default: module.TransportPathDialog })))
const WardrobeRunDialog = lazy(() => import('./WardrobeRunDialog'))
const UpperRowDialog = lazy(() => import('./UpperRowDialog'))
const BedroomSystemDialog = lazy(() => import('./BedroomSystemDialog'))
const UsageScenarioDialog = lazy(() => import('./UsageScenarioDialog'))
const ProjectArchiveDialog = lazy(() => import('./ProjectArchiveDialog'))
const SmartPlacementPanel = lazy(() => import('./SmartPlacementPanel'))
const LinkedPlacementPanel = lazy(() => import('./LinkedPlacementPanel'))
const ReplaceFurniturePanel = lazy(() => import('./ReplaceFurniturePanel'))
const HelpDialog = lazy(() => import('./HelpDialog'))
type History = { project: Project; past: Project[]; future: Project[] }
const splitViewport = '(min-width: 1280px)'

export function App() {
  const [history, setHistory] = useState<History>(() => ({ project: makeProject(), past: [], future: [] }))
  const { project } = history
  const visual = useMemo(() => designScene(project), [project])
  const activeProject = useRef(project)
  activeProject.current = project
  const [selection, setSelection] = useState<Selection>({ kind: 'room' })
  const [trialSelection, setTrial] = useState<TrialSelection>()
  const trialItemId = selection.kind === 'item' && trialSelection?.itemId === selection.id ? selection.id : undefined
  const trialPartId = trialSelection?.partId
  const motionSolution = useMemo(() => {
    if (!trialItemId) return
    const item = visual.items.find(entry => entry.id === trialItemId)
    const part = item && motionParts(item).find(part => part.id === trialPartId)
    return item && part ? solveMotion(visual, item, part) : undefined
  }, [visual, trialItemId, trialPartId])
  const amount = Math.min(trialSelection?.amount ?? 0, motionSolution?.part.max ?? 0)
  const trial = useMemo(() => motionSolution && motionTrial(motionSolution, amount), [motionSolution, amount])
  const selectionIds = selectedItemIds(selection)
  const [requestedView, setView] = useState<View>('plan')
  const [canSplit, setCanSplit] = useState(() => window.matchMedia(splitViewport).matches)
  const view = requestedView === 'split' && !canSplit ? 'plan' : requestedView
  const hasPlan = view === 'plan' || view === 'split'
  const hasScene = view === 'scene' || view === 'split'
  const [drawing, setDrawing] = useState<'new' | 'edit'>()
  const [zoom, setZoom] = useState(1)
  const [itemFocus, setItemFocus] = useState<FurnitureFocus>()
  const [onlySelected, setOnlySelected] = useState(false)
  const visibleItems = useMemo(() => {
    const ids = selectedItemIds(selection)
    return onlySelected && ids.length ? new Set(ids) : undefined
  }, [onlySelected, selection])
  const [ready, setReady] = useState(false)
  const [workspaceId, setWorkspaceId] = useState(initialProjectId)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [deliveryOpen, setDeliveryOpen] = useState(false)
  const overwriteLocal = useRef(true)
  const [saveState, setSaveState] = useState('Açılıyor…')
  const [notice, setNotice] = useState('')
  const [showSketch, setShowSketch] = useState(false)
  const [showDistances, setShowDistances] = useState(true)
  const [snapPosition, setSnapPosition] = useState(true)
  const [planPreview, setPlanPreview] = useState<Furniture[]>()
  const [mountPreview, setMountPreview] = useState<Furniture>()
  const [smartPlacement, setSmartPlacement] = useState<{ project: Project; ids: string[] }>()
  const [suggestedPlacement, setSuggestedPlacement] = useState<PlacementSuggestion>()
  const [linkPanel, setLinkPanel] = useState<{ projectId: string; layoutId?: string; ids: readonly string[] }>()
  const [linkedDraft, setLinkedDraft] = useState<{ base: Project; preview: LinkedPreview; rule?: boolean }>()
  const [symmetryDraft, setSymmetryDraft] = useState<{ base: Project; source: Project; preview: MountSymmetryChanges;
    items: Furniture[]; electrical: ElectricalReading[] }>()
  const [replaceSource, setReplaceSource] = useState<{ project: Project; id: string }>()
  const [replacePreview, setReplacePreview] = useState<ReplacementPreview>()
  const [trimMove, setTrimMove] = useState<{ project: Project; itemId: string; wallId: string }>()
  const [trimWallFocus, setTrimWallFocus] = useState<{ itemId: string; wallId: string }>()
  const selectedTrimItem = selection.kind === 'item' ? project.items.find(item => item.id === selection.id) : undefined
  const copyOptions = useMemo(() => selectedTrimItem ? adjacentCopies(project, selectedTrimItem) : [], [project, selectedTrimItem])
  const trimEdges = useMemo(() => roomEdges(project.walls), [project.walls])
  const selectedTrimContacts = useMemo(() => selectedTrimItem
    ? trimContacts(trimEdges, project.height, furnitureVolumes(wallMountPose(selectedTrimItem, trimEdges), project.height)) : [],
    [selectedTrimItem, trimEdges, project.height])
  const trimPreview = useMemo(() => trimMove?.project === project && selectedTrimItem?.id === trimMove.itemId
    && previewTrimClearance(project, selectedTrimItem, trimMove.wallId, selectedTrimContacts) || undefined,
    [trimMove, project, selectedTrimItem, selectedTrimContacts])
  useEffect(() => {
    if (trimMove && !trimPreview) setTrimMove(undefined)
  }, [trimMove, trimPreview])
  const linkedCard = useRef<HTMLElement>(null)
  const [help, setHelp] = useState<HelpTopic>()
  const [tab, setTab] = useState<'basic' | 'models'>('basic')
  const [modelBusy, setModelBusy] = useState(false)
  const [personalModels, setPersonalModels] = useState<PersonalModel[]>([])
  const [libraryNotice, setLibraryNotice] = useState('')
  const [studio, setStudio] = useState<'open' | 'closed'>()
  const [openGallery, setOpenGallery] = useState(false)
  const [exportingArchive, setExportingArchive] = useState(false)
  const [creatingEmptyRoom, setCreatingEmptyRoom] = useState(false)
  const [layoutsOpen, setLayoutsOpen] = useState(false)
  const [designsOpen, setDesignsOpen] = useState(false)
  const [installation, setInstallation] = useState<{ variant?: string; fromReview?: boolean }>()
  const [review, setReview] = useState<'open' | 'editing'>()
  const [reviewFocus, setReviewFocus] = useState<InspectorReviewFocus>()
  const [measureFocus, setMeasureFocus] = useState<{ id?: string; pick?: boolean }>()
  const [transport, setTransport] = useState<{ id: string; orientation?: TransportOrientation; fromReview?: boolean }>()
  const transportItem = project.items.find(item => item.id === transport?.id && item.kind === 'wardrobe')
  const [wardrobeRun, setWardrobeRun] = useState<{ wallId: string; id?: string; widthEdit?: WidthEdit }>()
  const [upperRow, setUpperRow] = useState<RowEdit>()
  const [bedroomOpen, setBedroomOpen] = useState(false)
  const [usageOpen, setUsageOpen] = useState(false)
  const [renderPair, setRenderPair] = useState<LayoutPair>()
  const [renderDesign, setRenderDesign] = useState<DesignRenderSelection>()
  const [hiddenDoors, setHiddenDoors] = useState<Set<string>>(() => new Set())
  const [coveringWall, setCoveringWall] = useState<string>()
  const [electricalFocus, setElectricalFocus] = useState<{ wallId: string; id: string }>()
  const [sectionId, setSectionId] = useState('')
  const [sectionAxis, setSectionAxis] = useState<RoomSection['axis']>('z')
  const [sectionPickName, setSectionPickName] = useState<string>()
  const pickingSection = sectionPickName !== undefined
  const [showSections, setShowSections] = useState(false)
  const selectedSection = project.sections?.find(section => section.id === sectionId)
  const changeView = (next: View) => { setSectionPickName(undefined); setView(next) }
  function saveSection(values: Omit<RoomSection, 'id'>) {
    const current = activeProject.current
    const sections = current.sections ?? []
    const id = selectedSection?.id ?? uid()
    const section = { ...values, id }
    if (apply({ ...current, sections: selectedSection ? sections.map(row => row.id === id ? section : row) : [...sections, section] })) {
      setSectionId(id)
      setShowSections(true)
      changeView('section')
    }
  }
  const projectInput = useRef<HTMLInputElement>(null)
  const modelInput = useRef<HTMLInputElement>(null)
  const menu = useRef<HTMLDetailsElement>(null)
  const smart = hasPlan && smartPlacement?.project === project && smartPlacement.ids.length === selectionIds.length
    && smartPlacement.ids.every((id, index) => id === selectionIds[index]) ? smartPlacement : undefined
  useEffect(() => {
    if (smartPlacement && !smart) {
      setSmartPlacement(undefined)
      setSuggestedPlacement(undefined)
    }
  }, [smartPlacement, smart])
  const editingLinks = linkPanel?.projectId === workspaceId && linkPanel.layoutId === project.layouts?.active ? linkPanel : undefined
  const pendingLink = hasPlan && linkedDraft?.base === project ? linkedDraft : undefined
  const pendingSymmetry = hasPlan && symmetryDraft?.base === project ? symmetryDraft : undefined
  useEffect(() => {
    if (linkPanel && !editingLinks) setLinkPanel(undefined)
    if (linkedDraft && !pendingLink) setLinkedDraft(undefined)
  }, [linkPanel, editingLinks, linkedDraft, pendingLink])
  useEffect(() => {
    if (pendingLink || pendingSymmetry) linkedCard.current?.scrollIntoView({ block: 'nearest' })
    if (symmetryDraft && !pendingSymmetry) setSymmetryDraft(undefined)
  }, [pendingLink, pendingSymmetry, symmetryDraft])
  const replacing = hasPlan && replaceSource?.project === project && selection.kind === 'item' && selection.id === replaceSource.id
    ? project.items.find(item => item.id === replaceSource.id) : undefined
  const modelPreview = replacing ? replacePreview : undefined
  useEffect(() => {
    if (replaceSource && !replacing) closeReplacement()
  }, [replaceSource, replacing])

  function closeReplacement() {
    setReplaceSource(undefined)
    setReplacePreview(undefined)
  }
  function startReplacement(id: string) {
    if (!hasPlan) changeView('plan')
    closeSmartPlacement()
    setTrimMove(undefined)
    setTrial(undefined)
    setLinkedDraft(undefined)
    setLinkPanel(undefined)
    setReplacePreview(undefined)
    setReplaceSource({ project, id })
  }
  function applyReplacement(value: ReplacementPreview, alternate: boolean) {
    const current = activeProject.current
    if (!replacing || replaceSource?.project !== current || value.error || value.item.id !== replacing.id) return
    const next = alternate ? duplicateLayout(current, value.project.items) : value.project
    if (!next) { setNotice('Yerleşim sınırına ulaşıldı.'); return }
    if (commitProject(next)) {
      setHiddenDoors(previous => {
        const next = new Set(previous)
        next.delete(replacing.id)
        return next
      })
      closeReplacement()
    }
  }

  function startSmartPlacement() {
    if (!hasPlan) changeView('plan')
    closeReplacement()
    setTrimMove(undefined)
    setTrial(undefined)
    setSuggestedPlacement(undefined)
    setLinkedDraft(undefined)
    setLinkPanel(undefined)
    setSmartPlacement({ project, ids: [...selectionIds] })
  }
  function closeSmartPlacement() {
    setSmartPlacement(undefined)
    setSuggestedPlacement(undefined)
  }
  function startLinkedPlacement() {
    if (!hasPlan) changeView('plan')
    closeReplacement()
    setTrimMove(undefined)
    setTrial(undefined)
    closeSmartPlacement()
    setLinkPanel({ projectId: workspaceId, layoutId: project.layouts?.active, ids: [...selectionIds] })
  }
  function proposeLink(rule: FurnitureLink) {
    const current = activeProject.current
    const links = current.furnitureLinks ?? []
    const next = links.some(link => link.id === rule.id) ? links.map(link => link.id === rule.id ? rule : link) : [...links, rule]
    apply({ ...current, furnitureLinks: next })
  }
  function removeLink(id: string) {
    const current = activeProject.current
    const links = current.furnitureLinks?.filter(link => link.id !== id)
    apply({ ...current, furnitureLinks: links?.length ? links : undefined })
  }
  function useSuggestedPlacement(suggestion: PlacementSuggestion) {
    const current = activeProject.current
    if (!smart || smart.project !== current) return
    const moved = new Map(suggestion.items.map(item => [item.id, item]))
    const items = current.items.map(item => {
      const next = moved.get(item.id)
      return next ? { ...item, x: next.x, z: next.z, angle: next.angle, mount: next.mount } : item
    })
    if (apply({ ...current, items }, true)) closeSmartPlacement()
  }

  useEffect(() => {
    let active = true
    void readPersonalModels().then(models => { if (active) setPersonalModels(models) })
      .catch(() => { if (active) setLibraryNotice('Kişisel katalog açılamadı.') })
    return () => { active = false }
  }, [])
  useEffect(() => {
    const media = window.matchMedia(splitViewport)
    const resize = () => setCanSplit(media.matches)
    resize()
    media.addEventListener('change', resize)
    return () => media.removeEventListener('change', resize)
  }, [])
  useEffect(() => { if (!hasPlan) setPlanPreview(undefined) }, [hasPlan])
  useEffect(() => {
    setHiddenDoors(new Set())
    setItemFocus(undefined)
    setOnlySelected(false)
  }, [project.layouts?.active])
  useEffect(() => {
    if (onlySelected && !visibleItems) setOnlySelected(false)
    if (itemFocus && itemFocus.ids.some(id => !project.items.some(item => item.id === id))) {
      setItemFocus(undefined)
      setZoom(1)
    }
  }, [itemFocus, project.items, onlySelected, visibleItems])
  useEffect(() => {
    setSelection(previous => {
      const ids = selectedItemIds(previous)
      const existing = ids.filter(id => project.items.some(item => item.id === id))
      return existing.length === ids.length ? previous : itemSelection(existing)
    })
  }, [project.items])

  function selectEditor(next: Selection, extend = false) {
    setReviewFocus(undefined)
    if (next.kind !== 'item' || next.id !== selectedTrimItem?.id || extend) {
      setTrimMove(undefined)
      setTrimWallFocus(undefined)
    }
    setSelection(previous => extend && next.kind === 'item' ? toggleItemSelection(previous, next.id) : next)
  }

  function focusSelection(ids = selectionIds) {
    const next = focusFurniture(activeProject.current, ids)
    if (!next) return
    if (!hasPlan && !hasScene) changeView('plan')
    setItemFocus(next)
    setZoom(1)
  }
  function chooseRoomItem(id: string, extend: boolean) {
    selectEditor({ kind: 'item', id }, extend)
    if (!extend) {
      if (view === 'elevation' && project.items.some(item => item.id === id && item.mount)) return
      focusSelection([id])
    }
    else if (onlySelected) focusSelection(selectedItemIds(toggleItemSelection(selection, id)))
  }
  function resetItemFocus() {
    setItemFocus(undefined)
    setZoom(1)
  }
  function clearItemView() {
    resetItemFocus()
    setOnlySelected(false)
  }

  function editWallCovering(id: string, change: (covering: WallCovering) => WallCovering) {
    return applyMaterial((current, designId) => {
      if (!current.walls.some(wall => wall.id === id)) return current
      const surface = findDesign(current, designId)?.surface ?? current.style
      const before = surface.wallCoverings?.[id] ?? { regions: [] }
      const wallCoverings = replaceWallCovering(surface, id, change(before))
      return editDesignSurface(current, designId, { wallCoverings })
    })
  }

  function drawWallCovering(area: Omit<WallRegion, 'id' | 'appearance'>) {
    if (!coveringWall) return
    const wall = coveringWall
    setCoveringWall(undefined)
    void editWallCovering(wall, covering => covering.regions.length >= maxWallRegions ? covering : {
      ...covering, regions: [...covering.regions, { ...area, id: uid(), appearance: { preset: 'matte-oak', color: '#a9835a' } }],
    })
  }

  useEffect(() => {
    let active = true
    const blocked = () => setNotice('Yerel depolamayı güncellemek için açık diğer MyHome sekmelerini yenileyin.')
    window.addEventListener('myhome-storage-blocked', blocked)
    void openLocalProject().then(stored => {
      if (active && stored) {
        setWorkspaceId(stored.id)
        setHistory({ project: stored.project, past: [], future: [] })
      }
    }).catch(() => {
      overwriteLocal.current = false
      if (active) setNotice('Tarayıcıdaki proje açılamadı. Bir proje dosyasını içe aktarabilirsiniz.')
    }).finally(() => { if (active) setReady(true) })
    return () => { active = false; window.removeEventListener('myhome-storage-blocked', blocked) }
  }, [])

  useEffect(() => {
    if (!ready) return
    if (!overwriteLocal.current) { setSaveState('Kayıt başarısız'); return }
    let active = true
    setSaveState('Kaydediliyor…')
    void saveLocalProject(workspaceId, project).then(() => {
      if (active) {
        setSaveState('Yerel kayıt')
        try {
          if (!localStorage.getItem('myhome-storage-tip')) {
            setNotice('Projeler bu tarayıcıda ve bu adreste saklanır. Başka bir cihaza geçerken Proje menüsünden yedek indirebilirsin.')
            localStorage.setItem('myhome-storage-tip', '1')
          }
        } catch { /* The project itself is already saved in IndexedDB. */ }
      }
    }).catch(() => { if (active) setSaveState('Kayıt başarısız') })
    return () => { active = false }
  }, [workspaceId, project, ready])

  function commitProject(draft: Project) {
    const resolved = reconcileUpperRows(activeProject.current, draft)
    if (resolved.error) { setNotice(resolved.error); return false }
    if (resolved.project.items !== draft.items && resolveMountSymmetries(draft, resolved.project)) {
      setNotice('Üst dolap sırasının konumu ile kayıtlı simetri kuralı uyuşmuyor.')
      return false
    }
    draft = resolved.project
    const keepClear = keepExistingClearances(draft.items, draft.keepClear)
    const next = dropUnusedDesignItems(keepClear === draft.keepClear ? draft : { ...draft, keepClear })
    const error = validateProject(next)
    setNotice(error ?? '')
    if (error) return false
    setLinkedDraft(undefined)
    setSymmetryDraft(undefined)
    activeProject.current = next
    setHistory(previous => ({ project: next, past: [...previous.past.slice(-34), previous.project], future: [] }))
    return true
  }
  function stageSymmetry(base: Project, source: Project, preview: MountSymmetryChanges) {
    const original = new Map(base.items.map(item => [item.id, item]))
    const changedIds = new Set(preview.items.map(item => item.id))
    const items = preview.project.items.filter(item => changedIds.has(item.id) || original.get(item.id) !== item)
    const formerPoints = new Map(electricalReadings(base).map(reading => [reading.point.id, reading.detail]))
    const electrical = electricalReadings(preview.project).filter(reading => formerPoints.get(reading.point.id) !== reading.detail)
    setNotice('')
    setSymmetryDraft({ base, source, preview, items, electrical })
  }
  function previewSymmetryDistance(ruleId: string, distance: number) {
    if (!pendingSymmetry || activeProject.current !== pendingSymmetry.base) return
    const source = { ...pendingSymmetry.source, mountSymmetries: pendingSymmetry.source.mountSymmetries?.map(rule =>
      rule.id === ruleId ? { ...rule, distance } : rule) }
    const preview = resolveMountSymmetries(pendingSymmetry.base, source)
    if (preview) stageSymmetry(pendingSymmetry.base, source, preview)
  }
  function apply(draft: Project, previewed = false) {
    const current = activeProject.current
    const links = removeMissingLinks(draft.items, draft.furnitureLinks)
    const rules = keepMountSymmetries(draft.mountSymmetries, draft.items, draft.walls)
    const candidate = links === draft.furnitureLinks && rules === draft.mountSymmetries ? draft
      : { ...draft, furnitureLinks: links, mountSymmetries: rules }
    const sameLayout = current.layouts?.active === candidate.layouts?.active && current.walls[0]?.id === candidate.walls[0]?.id
    const preview = sameLayout ? resolveLinkedPlacement(current, candidate) : undefined
    const source = preview?.project ?? candidate
    const symmetry = sameLayout && !preview?.error ? resolveMountSymmetries(current, source) : undefined
    if (symmetry) {
      closeReplacement()
      closeSmartPlacement()
      clearItemView()
      setTrial(undefined)
      setLinkedDraft(undefined)
      if (!hasPlan) changeView('plan')
      stageSymmetry(current, source, symmetry)
      return false
    }
    if (!preview) return commitProject(candidate)
    const rule = current.furnitureLinks !== candidate.furnitureLinks
    if (previewed && preview.error) { setNotice(preview.error); return false }
    if (!preview.error && !rule && !linkedItemsChanged(current, preview)) {
      setNotice('Bu eksende eşyanın konumunu bağlantı kuralı belirliyor.')
      return false
    }
    if (previewed) return commitProject(preview.project)
    setNotice('')
    closeSmartPlacement()
    setTrial(undefined)
    if (!hasPlan) changeView('plan')
    setLinkedDraft({ base: current, preview, rule })
    return false
  }
  function updateDesign(change: (project: Project) => Project) {
    const current = activeProject.current
    const next = change(current)
    if (next !== current) apply(next)
  }
  function openLayout(id: string) {
    const current = activeProject.current
    const next = switchLayout(current, id)
    if (next !== current && !apply(next)) return false
    setHiddenDoors(new Set())
    setPlanPreview(undefined)
    setLayoutsOpen(false)
    return true
  }
  function closeTransport() {
    if (transport?.fromReview) setReview('open')
    setTransport(undefined)
  }
  function locateReview(target: ReviewTarget, layout?: string) {
    if (layout && layout !== activeProject.current.layouts?.active && !openLayout(layout)) return
    setReview('editing')
    setReviewFocus(undefined)
    setMeasureFocus(undefined)
    setTrial(undefined)
    if (target.kind === 'electrical') {
      openElectrical(target.wallId, target.id)
      return
    }
    if (target.kind === 'survey') {
      setSelection({ kind: 'wall', id: target.id })
      setReviewFocus({ area: 'survey' })
      changeView('elevation')
      return
    }
    if (target.kind === 'measurement') {
      setSelection(target.itemId ? { kind: 'item', id: target.itemId } : { kind: 'room' })
      setMeasureFocus({ id: target.id, pick: !target.id && savedMeasurements(activeProject.current).length < maxMeasurements })
      changeView('plan')
      return
    }
    setSelection({ kind: 'item', id: target.kind === 'section' ? target.itemId : target.id })
    if (target.kind === 'section') {
      const section = activeProject.current.sections?.find(section => section.id === target.id)
      if (section) {
        setSectionId(section.id)
        setSectionAxis(section.axis)
        setReviewFocus({ area: 'assembly' })
        changeView('section')
        return
      }
    }
    changeView(target.kind === 'motion' && canSplit ? 'split' : 'plan')
    if (target.kind === 'motion') {
      setTrial({ itemId: target.id, partId: target.partId, amount: target.amount })
      setReviewFocus({ area: 'motion' })
    } else if (target.kind === 'route') {
      setTransport({ id: target.id, orientation: target.orientation, fromReview: true })
    } else if (target.kind === 'door') {
      setReviewFocus({ area: 'door', index: target.index })
    } else setReviewFocus({ area: target.kind === 'item' ? 'placement' : 'assembly' })
  }
  async function applyMaterial(change: (project: Project, designId: string, layoutId?: string) => Project) {
    const source = activeProject.current
    try {
      const current = activeProject.current
      if (current.walls[0].id !== source.walls[0].id) return
      const next = change(current, activeDesign(source), source.layouts?.active ?? current.layouts?.entries[0].id)
      if (next !== current) apply(next)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Malzeme seçilemedi.') }
  }
  function applyBaseboardToWalls(sourceId: string, ids: string[]) {
    const current = activeProject.current
    const next = copyBaseboard(current, sourceId, ids)
    if (next !== current) apply(next)
  }

  function proposeTrimMove(item: Furniture, wallId: string) {
    closeSmartPlacement()
    closeReplacement()
    setTrial(undefined)
    setLinkedDraft(undefined)
    setLinkPanel(undefined)
    setSymmetryDraft(undefined)
    setTrimMove({ project, itemId: item.id, wallId })
    if (!hasPlan) changeView('plan')
  }
  function undo() {
    setPlanPreview(undefined)
    setLinkedDraft(undefined)
    setHistory(h => {
      const prior = h.past.at(-1)
      return prior ? { project: prior, past: h.past.slice(0, -1), future: [h.project, ...h.future] } : h
    })
    setNotice('')
  }
  function redo() {
    setPlanPreview(undefined)
    setLinkedDraft(undefined)
    setHistory(h => h.future.length ? { project: h.future[0], past: [...h.past, h.project], future: h.future.slice(1) } : h)
    setNotice('')
  }
  function removeSelection() {
    if (!ready) return false
    const current = activeProject.current
    const next = removeSelectedFurniture(current.items, selection)
    if (!next || !apply({ ...current, items: next.items })) return false
    selectEditor(next.selection)
    clearItemView()
    setPlanPreview(undefined)
    setMountPreview(undefined)
    setTrial(undefined)
    return true
  }
  const removeFromKeyboard = useRef(removeSelection)
  removeFromKeyboard.current = removeSelection
  useEffect(() => {
    function keys(event: KeyboardEvent) {
      const target = event.target
      if (event.defaultPrevented || event.isComposing || document.querySelector('dialog[open]') || (target instanceof Element &&
        (target.closest('input, textarea, select, [role="textbox"]') || (target instanceof HTMLElement && target.isContentEditable)))) return
      if (event.key === 'Delete' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat) {
        if (removeFromKeyboard.current()) event.preventDefault()
        return
      }
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo() }
      if (event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  }, [])

  function defaultPosition(): Point {
    const frame = bounds(vertices(project.walls))
    const offset = (project.items.length % 5 - 2) * 120
    return { x: Math.round(frame.x + frame.width / 2 + offset), z: Math.round(frame.z + frame.depth / 2 + offset) }
  }
  function addItem(item: Furniture, source = activeProject.current) {
    const current = activeProject.current
    if (current.walls[0].id !== source.walls[0].id) return
    const layoutId = source.layouts?.active ?? current.layouts?.entries[0].id
    if (layoutId && !layoutName(current, layoutId)) return
    const scene = layoutScene(current, layoutId)
    if (scene.items.length >= 300) { setNotice('Bir yerleşimde en fazla 300 eşya olabilir.'); return }
    const next = editLayoutItems(current, layoutId, items => [...items, initialPlacement(scene, item)])
    if (next === current || !apply(next)) return
    if (layoutId === current.layouts?.active) {
      setSelection({ kind: 'item', id: item.id })
      setView(previous => previous === 'split' || previous === 'scene' && ['rug', 'curtain', 'mirror', 'pendant'].includes(item.kind)
        ? previous : 'plan')
    } else setNotice(`${item.name} · ${layoutName(current, layoutId)} yerleşimine eklendi.`)
  }
  function addMounted(kind: MountedKind, bar = false) {
    const wall = project.walls.find(wall => selection.kind === 'wall' && selection.id === wall.id) ?? project.walls[0]
    addItem(makeMountedFurniture(kind, wall.id, wall.length / 2, project.height, bar))
  }
  function addBedroom(model: BedroomModel) {
    const { bottom } = bedroomCatalog[model]
    const point = defaultPosition()
    if (bottom === undefined) { addItem(makeBedroomFurniture(model, point)); return }
    const edges = roomEdges(project.walls)
    const bed = project.items.find(item => item.kind === 'bed' && selection.kind === 'item' && item.id === selection.id)
    const edge = edges.find(({ wall }) => selection.kind === 'wall' && wall.id === selection.id)
      ?? (bed && suggestBedroomWall(bed, edges)) ?? edges[0]
    const offset = bed ? Math.round((bed.x - edge.a.x) * edge.dx + (bed.z - edge.a.z) * edge.dz) : Math.round(edge.wall.length / 2)
    addItem(makeBedroomFurniture(model, point, { wallId: edge.wall.id, offset,
      bottom: Math.min(bottom, Math.max(0, project.height - bedroomCatalog[model].size[2])) }))
  }
  function addCurtain(fabric: 'sheer' | 'opaque') {
    const current = activeProject.current
    const windows = current.walls.flatMap(wall => wall.openings.flatMap(opening =>
      opening.kind === 'window' ? [{ wall, opening }] : []))
    const target = windows.find(({ wall }) => selection.kind === 'wall' && wall.id === selection.id) ?? windows[0]
    if (!target) { setNotice('Perde eklemek için önce bir pencere çiz.'); return }
    addItem(makeCurtain(target.wall, target.opening, fabric, current.height), current)
  }
  async function loadGlb(file?: File) {
    if (!file) return
    setModelBusy(true)
    const source = activeProject.current
    try {
      addItem(await importModel(file, defaultPosition()), source)
    }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Model yüklenemedi.') }
    finally { setModelBusy(false) }
  }
  async function addCatalog(id: string) {
    const source = activeProject.current
    try {
      addItem(makeCatalogFurniture(id, defaultPosition()), source)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Model eklenemedi.') }
  }

  async function savePersonalModel(item: Furniture) {
    const entry = personalModelFrom(item)
    if (!entry) return
    try {
      await editPersonalModels(models => models.add(entry))
      setPersonalModels(current => [...current, entry])
      setLibraryNotice(`${entry.name} kişisel kataloğa kaydedildi.`)
      setTab('models')
    } catch {
      setLibraryNotice('Model kişisel kataloğa kaydedilemedi.')
      setTab('models')
    }
  }

  async function removePersonalModel(id: string) {
    try {
      await editPersonalModels(models => models.delete(id))
      setPersonalModels(current => current.filter(entry => entry.id !== id))
      setLibraryNotice('Model kişisel katalogdan kaldırıldı.')
    } catch { setLibraryNotice('Model kişisel katalogdan kaldırılamadı.') }
  }

  async function addPersonalModel(entry: PersonalModel) {
    const source = activeProject.current
    try {
      addItem(makePersonalFurniture(entry, defaultPosition()), source)
    } catch (error) { setLibraryNotice(error instanceof Error ? error.message : 'Model eklenemedi.') }
  }
  function exportProject() {
    download(new Blob([JSON.stringify(project)], { type: 'application/json' }), `${projectFilename(project.title)}.myhome.json`)
    if (menu.current) menu.current.open = false
  }
  async function exportProjectWithRenders() {
    setExportingArchive(true)
    setNotice('')
    try {
      download(await exportArchive({ id: workspaceId, project: activeProject.current }, true),
        `${projectFilename(project.title)}.workspace.json`)
      if (menu.current) menu.current.open = false
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Proje yedeği oluşturulamadı.') }
    finally { setExportingArchive(false) }
  }
  function switchEditor(next: OpenProject) {
    overwriteLocal.current = true
    activeProject.current = next.project
    setWorkspaceId(next.id)
    setHistory({ project: next.project, past: [], future: [] })
    setArchiveOpen(false)
    setDeliveryOpen(false)
    setStudio(undefined)
    setNotice('')
    setPlanPreview(undefined)
    setTrimMove(undefined)
    setTrimWallFocus(undefined)
    setLinkedDraft(undefined)
    setLinkPanel(undefined)
    closeReplacement()
    setHiddenDoors(new Set())
    setSelection({ kind: 'room' })
    clearItemView()
    setTrial(undefined)
    setReview(undefined)
    setReviewFocus(undefined)
    setMeasureFocus(undefined)
    setTransport(undefined)
    setUsageOpen(false)
    setInstallation(undefined)
    setSectionId('')
    setSectionAxis('z')
    setShowSections(false)
    changeView('plan')
    setZoom(1)
  }
  async function switchProject(next: OpenProject, baseline?: Revision) {
    const previous = overwriteLocal.current ? { id: workspaceId, project: activeProject.current } : undefined
    await activateProject(next, previous, baseline)
    switchEditor(next)
  }
  async function createEmptyRoomCopy() {
    if (!ready || creatingEmptyRoom || !overwriteLocal.current) return
    const empty = emptyRoomProject(activeProject.current)
    setCreatingEmptyRoom(true)
    if (menu.current) menu.current.open = false
    try {
      await switchProject(newArchiveProject(empty.title, empty))
      setShowSketch(false)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Boş oda kopyası oluşturulamadı.') }
    finally { setCreatingEmptyRoom(false) }
  }
  async function importProject(file?: File) {
    if (!file) return
    try {
      if (file.size > maxBackupBytes) throw new Error('Dosya yedek boyutu sınırını aşıyor.')
      const raw = JSON.parse(await file.text()) as { format?: string } | null
      if (raw?.format === 'myhome-workspace') {
        const next = await restoreArchive(raw, overwriteLocal.current ? { id: workspaceId, project: activeProject.current } : undefined)
        switchEditor(next)
        void readPersonalModels().then(setPersonalModels).catch(() => setLibraryNotice('Kişisel katalog açılamadı.'))
        return
      }
      if (file.size > 60 * 1024 * 1024) throw new Error('Proje dosyası en fazla 60 MB olmalı.')
      const next = readProject(raw)
      await switchProject({ id: uid(), project: next })
    } catch (error) { setNotice(error instanceof Error && error.name !== 'ZodError' ? error.message : 'Geçerli bir MyHome proje dosyası seçin.') }
  }
  const mountedSelection = selection.kind === 'item' ? project.items.find(item => item.id === selection.id)?.mount?.wallId : undefined
  const contactWall = selectedTrimItem && trimWallFocus?.itemId === selectedTrimItem.id ? trimWallFocus.wallId : undefined
  const preferredWall = selection.kind === 'wall' ? selection.id : contactWall ?? mountedSelection ?? selectedTrimContacts[0]?.wallId
  const wallId = project.walls.find(wall => wall.id === preferredWall)?.id ?? project.walls[0].id
  function commitMountMove(id: string, axis: MountAxis, value: number) {
    const current = activeProject.current
    const item = current.items.find(entry => entry.id === id)
    const next = item && wallMovePreview(current, item, axis, value, roomEdges(current.walls))
    if (!next || next.item.mount?.[axis] === item?.mount?.[axis]) return false
    if (next.blocked) { setNotice(next.blocked); return false }
    return apply({ ...current, items: replaceFurniture(current.items, [next.item]) }, true)
  }
  function commitMountSymmetry(setup: MountSymmetry, saveRule: boolean, ruleId?: string) {
    const current = activeProject.current
    const next = wallSymmetryPreview(current, setup)
    const error = next.error ?? next.left?.blocked ?? next.right?.blocked
    if (error) { setNotice(error); return false }
    if (next.items.length !== 2) return false
    const rules = current.mountSymmetries ?? []
    const record = { ...setup, id: ruleId ?? uid() }
    if (saveRule) {
      if (!ruleId && rules.length >= maxMountSymmetries) { setNotice(`En fazla ${maxMountSymmetries} simetri kuralı kaydedilebilir.`); return false }
      const conflict = mountSymmetryRuleConflict(rules, record)
      if (conflict) { setNotice(conflict); return false }
      return commitProject({ ...current, items: replaceFurniture(current.items, next.items),
        mountSymmetries: [...rules.filter(rule => rule.id !== record.id), record] })
    }
    if (next.items.every(item => current.items.find(source => source.id === item.id)?.mount?.offset === item.mount?.offset)) return true
    return apply({ ...current, items: replaceFurniture(current.items, next.items) }, true)
  }
  function removeMountSymmetry(id: string) {
    const current = activeProject.current
    const rules = current.mountSymmetries?.filter(rule => rule.id !== id)
    return commitProject({ ...current, mountSymmetries: rules?.length ? rules : undefined })
  }
  function openElectrical(wallId: string, id: string) {
    selectEditor({ kind: 'wall', id: wallId })
    setElectricalFocus({ wallId, id })
    changeView('elevation')
  }
  function saveElectrical(wallId: string, points: ElectricalPoint[]) {
    const current = activeProject.current
    if (!current.walls.some(wall => wall.id === wallId)) return false
    return apply({ ...current, walls: current.walls.map(wall =>
      wall.id === wallId ? { ...wall, electricalPoints: points.length ? points : undefined } : wall) })
  }
  function copyBeside(side: CopySide) {
    const current = activeProject.current
    const source = current.items.find(item => item.id === selectedTrimItem?.id)
    if (!source) return
    const option = adjacentCopies(current, source).find(option => option.side === side)
    if (!option) { setNotice('Bu tarafta bitişik kopya için yeterli boşluk yok.'); return }
    const item = { ...option.item, id: uid() }
    if (apply(addFurnitureCopy(current, source.id, item), true)) {
      selectEditor({ kind: 'item', id: item.id })
      if (itemFocus && (hasPlan || hasScene)) focusSelection(onlySelected ? [item.id] : [source.id, item.id])
    }
  }
  const copyControls: CopyControls | undefined = selectedTrimItem && !smart && !replaceSource && !pendingLink &&
    !pendingSymmetry && !trimPreview && !trial && !planPreview && !mountPreview && !editingLinks
    ? { sourceId: selectedTrimItem.id, options: copyOptions, add: copyBeside } : undefined

  function copyMount(options: MountCopy) {
    const current = activeProject.current
    const item = current.items.find(entry => entry.id === options.sourceId)
    const next = item && wallCopyPreview(current, item, options)
    if (!next) return false
    if (next.blocked) { setNotice(next.blocked); return false }
    if (!next.item || !apply(addFurnitureCopy(current, options.sourceId, next.item), true)) return false
    selectEditor({ kind: 'item', id: next.item.id })
    return true
  }
  useEffect(() => {
    if (view !== 'elevation' || coveringWall !== wallId) setCoveringWall(undefined)
  }, [view, wallId, coveringWall])

  return <main className="app" aria-busy={!ready}>
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><House size={21} strokeWidth={1.8} /></div><span>MyHome</span></div>
      <div className="project-title"><span>{project.title}</span><small className={saveState === 'Kayıt başarısız' ? 'failed' : ''}>
        <i />{saveState}</small></div>
      <div className="top-actions">
        <button className="icon help-button" aria-label="Yardım" onClick={() => setHelp('room')}><CircleHelp size={19} /></button>
        <button className="layouts-launch" aria-label="Yerleşimler" disabled={!ready}
          onClick={() => { setNotice(''); setLayoutsOpen(true) }}>
          <Columns2 size={17} /><span>{layoutName(project) ?? 'Yerleşimler'}</span>
        </button>
        <button type="button" className="usage-launch" aria-label="Kullanım senaryoları" title="Kullanım senaryoları" disabled={!ready}
          onClick={() => setUsageOpen(true)}><Footprints size={17} /><span>Kullanım</span></button>
        <button className="designs-launch" aria-label="Tasarımlar" title={designName(project)} disabled={!ready}
          onClick={() => { setNotice(''); setDesignsOpen(true) }}>
          <Palette size={17} /><span>{project.designs?.active ? designName(project) : 'Tasarımlar'}</span>
        </button>
        <button className="render-launch" aria-label="4K Cycles render" disabled={!ready}
          onClick={() => { setOpenGallery(false); setRenderPair(undefined); setRenderDesign(undefined); setStudio('open') }}>
          <Film size={17} /><span>4K Cycles</span>
        </button>
        <details className="project-menu" ref={menu}><summary><Layers3 size={16} /> Proje <ChevronDown size={14} /></summary>
          <div className="menu-popup">
            <button disabled={!ready} onClick={() => {
              if (menu.current) menu.current.open = false
              setArchiveOpen(true)
            }}><Layers3 size={16} /> Yerel projeler</button>
            <button disabled={!ready || !overwriteLocal.current || creatingEmptyRoom} onClick={() => void createEmptyRoomCopy()}>
              <Box size={16} /> Boş oda kopyası oluştur</button>
            <button disabled={!ready} onClick={() => { if (menu.current) menu.current.open = false; projectInput.current?.click() }}><FileUp size={16} /> Projeyi aç</button>
            <button onClick={exportProject}><Download size={16} /> Proje dosyasını indir</button>
            
              <button disabled={!ready || !overwriteLocal.current} onClick={() => {
                if (menu.current) menu.current.open = false
                setDeliveryOpen(true)
              }}><Download size={16} /> Teslim paketi oluştur</button>
              <button disabled={!ready} onClick={() => {
                if (menu.current) menu.current.open = false
                setReview('open')
              }}><ScanLine size={16} /> Montaj Öncesi Kontrol</button>
              <button disabled={!ready} onClick={() => {
                if (menu.current) menu.current.open = false
                setRenderPair(undefined); setRenderDesign(undefined); setOpenGallery(true); setStudio('open')
              }}><Film size={16} /> Proje renderları</button>
              <button disabled={!ready || !overwriteLocal.current || exportingArchive}
                onClick={() => void exportProjectWithRenders()}><Download size={16} />
                {exportingArchive ? 'Yedek hazırlanıyor…' : 'Projeyi renderlarla indir'}</button>
            
            <button disabled={!ready} onClick={() => {
              if (menu.current) menu.current.open = false
              setInstallation({})
            }}><FileDown size={16} /> Montaj planı PDF</button>
          </div>
        </details>
        <button className="primary draw-button" onClick={() => setDrawing('new')}><Plus size={18} /> Oda çiz</button>
        <input hidden ref={projectInput} type="file" accept=".json,application/json" onChange={event => {
          void importProject(event.target.files?.[0]); event.target.value = ''
        }} />
      </div>
    </header>
    <div className="workspace">
      <aside className="library">
        <div className="sidebar-heading"><span className="section-icon"><Armchair size={18} /></span>
          <div><h2>Eşya ekle</h2><p>Ölçüyle yerleştirin</p></div></div>
        <div className="library-body">
          <div className="library-tabs" role="group" aria-label="Eşya kategorileri">
            <button aria-pressed={tab === 'basic'} onClick={() => setTab('basic')}>Tipler</button>
            <button aria-pressed={tab === 'models'} onClick={() => setTab('models')}>3B modeller</button>
          </div>
          {tab === 'basic' ? <FurnitureLibrary add={addItem} addMounted={addMounted} addCurtain={addCurtain}
            wardrobeRun={() => setWardrobeRun({ wallId })}
            addBedroom={addBedroom} bedroomSystem={() => {
              if (!project.items.some(item => item.kind === 'bed')) {
                setNotice('Yatak başı sistemini açmak için önce odaya bir yatak ekle.')
                return
              }
              setBedroomOpen(true)
            }}
            position={defaultPosition} roomHeight={project.height} /> :
            <div className="library-categories">
            {modelCatalog.map(item => <LibraryCategory key={item.id} name={item.category} icon={Box}>
              <ModelCard name={item.name} select={() => void addCatalog(item.id)}
                source={`${import.meta.env.BASE_URL}library/${item.id}.webp`} dimensions={libraryDimensions(item.width, item.depth, item.height)} />
            </LibraryCategory>)}
            <LibraryCategory name="Kişisel modellerim" icon={Box}>
              {personalModels.length === 0 && <p className="meta">Bir GLB modeli seçip eşya panelinden kataloğa kaydet.</p>}
              {personalModels.map(entry => <div key={entry.id} className="personal-model">
                <ModelCard name={entry.name} select={() => void addPersonalModel(entry)} preview={<PersonalModelPreview entry={entry} />}
                  dimensions={libraryDimensions(entry.width, entry.depth, entry.height)} />
                <button className="icon" aria-label={`${entry.name} modelini katalogdan kaldır`} onClick={() => void removePersonalModel(entry.id)}>
                  <Trash2 size={15} />
                </button>
              </div>)}
            </LibraryCategory>
            {libraryNotice && <p className="meta" role="status">{libraryNotice}</p>}
            <button className="full" disabled={modelBusy} onClick={() => modelInput.current?.click()}>
              <FileUp size={16} /> {modelBusy ? 'Model okunuyor…' : 'GLB içe aktar'}</button>
            <input ref={modelInput} hidden type="file" accept=".glb,model/gltf-binary" onChange={event => {
              void loadGlb(event.target.files?.[0]); event.target.value = ''
            }} />
          </div>}
          <RoomItemList key={workspaceId} items={project.items} selected={selectionIds} choose={chooseRoomItem}
            focus={() => focusSelection()} reset={resetItemFocus} focused={Boolean(itemFocus)} isolated={Boolean(visibleItems)}
            toggleIsolation={() => {
              if (visibleItems) clearItemView()
              else if (selectionIds.length) { setOnlySelected(true); focusSelection() }
            }} />
        </div>
      </aside>
      <section className="editor" aria-label="Oda düzenleyicisi">
        <div className="editor-toolbar">
          <div className="view-tabs" role="group" aria-label="Görünüm">
            <button aria-pressed={view === 'plan'} onClick={() => changeView('plan')}><Grid2X2 size={16} /> 2B plan</button>
            <button aria-pressed={view === 'scene'} onClick={() => changeView('scene')}><Box size={17} /> 3B görünüm</button>
            {canSplit && <button aria-pressed={view === 'split'} onClick={() => changeView('split')}>
              <Columns2 size={17} /> 2B + 3B
            </button>}
            <button aria-pressed={view === 'elevation'} onClick={() => {
              if (!mountedSelection) setSelection({ kind: 'wall', id: wallId })
              changeView('elevation')
            }}>
              <ScanLine size={17} /> <span>Duvar</span></button>
            <button aria-pressed={view === 'section'} onClick={() => {
              if (!selectedSection && project.sections?.[0]) {
                setSectionId(project.sections[0].id)
                setSectionAxis(project.sections[0].axis)
              }
              changeView('section')
            }}><ScanLine size={16} /> Kesit</button>
          </div>
          <div className="toolbar-right">
            <button className="icon" aria-label="Geri al" disabled={!history.past.length} onClick={undo}><Undo2 size={17} /></button>
            <button className="icon" aria-label="Yinele" disabled={!history.future.length} onClick={redo}><Redo2 size={17} /></button>
          </div>
        </div>
        <div className={`stage stage-${view}`}>
          {hasPlan && <section className="editor-pane plan-pane" aria-label="2B çalışma alanı">
            <PlanCanvas project={visual} zoom={zoom} showSketch={showSketch} selection={selection} openElectrical={openElectrical} copyControls={copyControls}
              trial={trial} measureFocus={measureFocus} focus={itemFocus?.plan} visibleItems={visibleItems}
              placementPreview={pendingSymmetry?.items ?? modelPreview?.items ?? trimPreview?.items ?? (smart ? suggestedPlacement?.items : undefined)}
              trimContacts={selectedTrimContacts} trimPreview={trimPreview && { blocked: Boolean(trimPreview.error) }}
              symmetryPreview={pendingSymmetry && { blocked: Boolean(pendingSymmetry.preview.error) }}
              replacementPreview={modelPreview && { blocked: Boolean(modelPreview.error || modelPreview.warnings.length) }}
              linkedPreview={pendingLink?.preview} showLinks={Boolean(editingLinks)}
              showSections={showSections}
              pickSection={pickingSection ? point => {
                if (!pointInRoom(point, roomEdges(project.walls))) { setNotice('Kesit için oda içinde bir nokta seçin.'); return }
                saveSection({ axis: sectionAxis, offset: sectionOffset(sectionAxis, point),
                  name: sectionPickName || selectedSection?.name || `Kesit ${sectionMark(project.sections?.length ?? 0)}` })
              } : undefined}
              snap={snapPosition} showDistances={showDistances}
              setMeasurements={measurements => apply({ ...activeProject.current, passage: undefined, measurements })}
              preview={items => {
                if (items && pendingLink) setLinkedDraft(undefined)
                if (items && pendingSymmetry) setSymmetryDraft(undefined)
                if (items && trimPreview) setTrimMove(undefined)
                setPlanPreview(items)
              }}
              select={selectEditor} commit={poses => {
                const current = activeProject.current
                const byId = new Map(poses.map(pose => [pose.id, pose]))
                const items = current.items.map(item => {
                  const next = byId.get(item.id)
                  return next && !item.locked && !item.curtain
                    ? { ...item, x: next.x, z: next.z, angle: next.angle, mount: next.mount } : item
                })
                apply({ ...current, items }, true)
              }} />
            <div className="stage-controls">
              {pickingSection && <button onClick={() => changeView('section')}>Kesit seçimini iptal et</button>}
              {!pickingSection && !!project.sections?.length && <button aria-pressed={showSections}
                onClick={() => setShowSections(value => !value)}>Kesit çizgileri</button>}
              <button aria-pressed={showDistances} onClick={() => setShowDistances(!showDistances)}><Ruler size={15} /> Mesafeler</button>
              <button aria-pressed={snapPosition} title="Sürüklerken Alt tuşuyla geçici olarak kapat"
                onClick={() => setSnapPosition(!snapPosition)}><Magnet size={15} /> Hizala</button>
              {project.sketch && <button aria-pressed={showSketch} onClick={() => setShowSketch(!showSketch)}>Taslak</button>}
              <div className="zoom">
                <button className="icon" aria-label="Uzaklaştır" onClick={() => setZoom(z => Math.max(.6, z - .15))}><Minus size={16} /></button>
                <button aria-label="Yakınlaştırmayı sıfırla" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
                <button className="icon" aria-label="Yakınlaştır" onClick={() => setZoom(z => Math.min(2.2, z + .15))}><Plus size={16} /></button>
              </div>
            </div>
          </section>}
          {view === 'elevation' && <WallElevation project={visual} wallId={wallId} copyControls={copyControls} itemId={selection.kind === 'item' ? selection.id : undefined}
            trimContacts={selectedTrimContacts.filter(contact => contact.wallId === wallId)}
            electricalFocus={electricalFocus} saveElectrical={saveElectrical} removeSymmetry={removeMountSymmetry}
            selectWall={id => selectEditor({ kind: 'wall', id })} selectItem={id => selectEditor({ kind: 'item', id })}
            previewMount={setMountPreview} commitMove={commitMountMove} copyMount={copyMount} commitSymmetry={commitMountSymmetry}
            snap={snapPosition} setSnap={setSnapPosition}
            drawCovering={coveringWall === wallId ? drawWallCovering : undefined} cancelCovering={() => setCoveringWall(undefined)} />}
          {view === 'section' && <SectionView project={visual} section={selectedSection} axis={sectionAxis}
            select={id => {
              setSectionId(id)
              setSectionAxis(project.sections?.find(entry => entry.id === id)?.axis ?? 'z')
            }}
            setAxis={setSectionAxis} pick={name => { setNotice(''); setView('plan'); setSectionPickName(name) }}
            save={saveSection} remove={() => {
              if (apply({ ...project, sections: project.sections?.filter(entry => entry.id !== sectionId) })) setSectionId('')
            }} />}
          {hasScene && <section className="editor-pane scene-pane" aria-label="3B çalışma alanı">
            <Suspense fallback={<div className="canvas-message">3B görünüm yükleniyor…</div>}>
              <Scene project={visual} copyControls={copyControls} personal saveCamera={camera => setHistory(h => ({ ...h, project: { ...h.project, camera } }))}
                trial={trial} changeTrial={amount => setTrial(current => current && { ...current, amount })}
                saveImage={async (image, camera) => {
                  const { mountingLayoutCode } = await import('./mounting-codes')
                  await saveProjectPng(workspaceId, project.title, image, {
                    projectId: workspaceId, projectName: project.title, camera, layoutCode: await mountingLayoutCode(visual),
                    cameraLabel: project.cameraViews?.find(view => sameCamera(view.camera, camera))?.name ?? 'Etkin 3B kadrajı',
                    layout: layoutName(project), design: designName(project), light: visual.style.light, sun: visual.style.sun,
                    fixtures: renderFixtureStates(visual),
                  }, { ...layoutScene(visual), camera })
                  announceSceneJobs()
                }}
                update={change => apply(change(activeProject.current))} selection={selection} select={selectEditor} hiddenDoors={hiddenDoors}
                itemFocus={itemFocus} visibleItems={visibleItems} clearItemView={clearItemView}
                snapPosition={snapPosition} setSnapPosition={setSnapPosition} planPreview={view === 'split' ? planPreview : undefined}
                paired={view === 'split'} />
            </Suspense>
          </section>}
        </div>
        <footer className={review === 'editing' ? 'editor-footer review-return' : 'editor-footer'}>
          {notice ? <span role="alert" className="error-message">{notice}</span> :
            <span><PencilRuler size={15} /> {pickingSection ? 'Kesit çizgisinin geçeceği bir nokta seçin' : hasPlan
              ? 'Ölçüler cm · Eşyaları sürükleyin' : view === 'scene' ? 'Görünümü döndürmek için boş alanda sürükleyin' : 'Kotlar bitmiş zeminden ölçülür'}</span>}
          {review === 'editing' && <button onClick={() => setReview('open')}>Kontrole dön</button>}
        </footer>
      </section>
      <Inspector project={project} visual={visual} selection={selection} copyControls={copyControls} setSelection={next => {
        selectEditor(next)
      }} apply={apply} personal
        removeSelection={removeSelection}
        copyBaseboard={applyBaseboardToWalls}
        trimClearance={selectedTrimItem && <TrimClearanceControls item={selectedTrimItem} contacts={selectedTrimContacts} edges={trimEdges}
          preview={trimPreview} showWall={id => { setTrimWallFocus({ itemId: selectedTrimItem.id, wallId: id }); changeView('elevation') }}
          propose={id => proposeTrimMove(selectedTrimItem, id)} cancel={() => setTrimMove(undefined)} apply={() => {
            if (trimMove?.project === activeProject.current && trimPreview && !trimPreview.error && apply(trimPreview.project, true)) {
              setTrimMove(undefined)
            }
          }} />}
        startReplacement={startReplacement}
        replacement={replacing && <Suspense fallback={<p role="status">Model seçenekleri yükleniyor…</p>}>
          <ReplaceFurniturePanel project={project} source={replacing} catalog personal={personalModels}
            upload={async file => {
              return importModel(file, { x: replacing.x, z: replacing.z })
            }}
            preview={setReplacePreview} apply={applyReplacement} close={closeReplacement} help={() => setHelp('replace')} />
        </Suspense>}
        startSmartPlacement={startSmartPlacement}
        smartPlacement={smart && <Suspense fallback={<p role="status">Konum araması yükleniyor…</p>}>
          <SmartPlacementPanel project={smart.project} ids={smart.ids} preview={setSuggestedPlacement}
            apply={useSuggestedPlacement} close={closeSmartPlacement} help={() => setHelp('smart')} /></Suspense>}
        startLinkedPlacement={startLinkedPlacement}
        linkedPlacement={editingLinks && <Suspense fallback={<p role="status">Bağlı yerleşim yükleniyor…</p>}>
          <LinkedPlacementPanel project={project} ids={editingLinks.ids} preview={proposeLink} remove={removeLink}
            cancelPreview={() => setLinkedDraft(undefined)} close={() => { setLinkedDraft(undefined); setLinkPanel(undefined) }}
            help={() => setHelp('linked')} /></Suspense>}
        linkedPreview={pendingSymmetry ? <section ref={linkedCard} className="linked-preview-card" aria-label="Kayıtlı simetri önizlemesi">
          <h3>Kayıtlı simetri önizlemesi</h3>
          {pendingSymmetry.preview.error && <p className="error-message" role="alert">{pendingSymmetry.preview.error}</p>}
          <ul>{pendingSymmetry.preview.results.flatMap(({ rule, preview }) => [preview.left, preview.right].map((side, index) =>
            side && <li key={rule.id + index}><strong>{side.name}</strong>
              <small>{fmt(side.offset)} cm merkez{side.mirrorGap !== undefined &&
                (side.mirrorGap >= 0 ? ` · Aynaya ${fmt(side.mirrorGap)} cm boşluk` : ` · Aynayla ${fmt(-side.mirrorGap)} cm yatay örtüşme`)}</small>
              {side.blocked && <small className="error-message">{side.blocked}</small>}</li>))}</ul>
          {pendingSymmetry.electrical.length > 0 && <>
            <h4>Elektrik noktalarındaki etkiler</h4>
            <ul>{pendingSymmetry.electrical.map(({ point, detail, status }) => <li key={point.id}>
              <strong>{point.name}</strong><small className={status === 'passed' ? undefined : 'error-message'}>
                {detail}{point.example && ' · Örnek ölçü'}
              </small></li>)}</ul>
          </>}
          {pendingSymmetry.preview.results.map(({ rule }) => <SymmetryRangeSearch key={rule.id}
            project={pendingSymmetry.preview.project} setup={rule} select={distance => previewSymmetryDistance(rule.id, distance)} />)}
          <div className="draw-actions">
            {!pendingSymmetry.preview.error && <button type="button" className="primary" onClick={() => {
              if (activeProject.current === pendingSymmetry.base) commitProject(pendingSymmetry.preview.project)
            }}>Simetriyle birlikte uygula</button>}
            <button type="button" onClick={() => setSymmetryDraft(undefined)}>Önizlemeyi kapat</button>
          </div>
        </section> : pendingLink && <section ref={linkedCard} className="linked-preview-card" aria-label="Bağlı değişiklik önizlemesi">
          <h3>Bağlı değişiklik önizlemesi</h3>
          {pendingLink.preview.error ? <p className="error-message" role="alert">{pendingLink.preview.error}</p> :
            <ul>{pendingLink.preview.items.map(item => <li key={item.id}><strong>{item.name}</strong>
              <small>X {fmt(item.x)} · Z {fmt(item.z)} cm</small></li>)}</ul>}
          <div className="draw-actions">
            {!pendingLink.preview.error && <button type="button" className="primary" onClick={() => {
              if (activeProject.current === pendingLink.base) commitProject(pendingLink.preview.project)
            }}>{pendingLink.rule ? 'Kuralı kaydet' : 'Değişiklikleri uygula'}</button>}
            <button type="button" onClick={() => setLinkedDraft(undefined)}>Önizlemeyi kapat</button>
          </div>
        </section>}
        trial={trial} setTrial={setTrial} reviewFocus={reviewFocus} openRoute={id => setTransport({ id })}
        preview={view === 'elevation' ? mountPreview :
          hasPlan && selection.kind === 'item' ? planPreview?.find(item => item.id === selection.id) : undefined}
        hiddenDoors={hiddenDoors} toggleDoors={id => setHiddenDoors(current => {
          const next = new Set(current)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })}
        changeSurface={patch => updateDesign(current => editDesignSurface(current, activeDesign(current), patch))}
        changeItemColor={(id, color) => updateDesign(current => editDesignItem(current, activeDesign(current),
          current.layouts?.active, id, paint => ({ ...paint, color })))}
        chooseFinish={floorFinish => void applyMaterial((current, designId) =>
          editDesignSurface(current, designId, { floorFinish, floorTexture: undefined }))}
        chooseFurnitureMaterial={(id, slot, appearance) => void applyMaterial((current, designId, layoutId) =>
          editDesignItem(current, designId, layoutId, id, paint => ({ ...paint, appearances: { ...paint.appearances, [slot]: appearance } })))}
        editWallCovering={(id, change) => void editWallCovering(id, change)}
        chooseArchitecturalMaterial={(target, appearance) => void applyMaterial(current =>
          paintArchitecturalSurface(current, target, appearance))}
        savePersonalModel={item => void savePersonalModel(item)}
        drawCovering={id => {
          setSelection({ kind: 'wall', id })
          setView('elevation')
          setCoveringWall(id)
        }}
        wardrobeRun={(wallId, id, widthEdit) => setWardrobeRun({ wallId, id, widthEdit })}
        openUpperRow={setUpperRow}
        editRoom={() => setDrawing('edit')} view={view} setView={changeView} />
    </div>
    {drawing && <DrawDialog project={project} edit={drawing === 'edit'} close={() => setDrawing(undefined)}
      apply={next => { apply(next); setHiddenDoors(new Set()); setSelection({ kind: 'room' }); setDrawing(undefined); setView('plan'); clearItemView()
        setShowSketch(Boolean(next.sketchReference?.calibration)) }} />}
    {layoutsOpen && <Suspense fallback={null}><LayoutDialog project={project} itemId={selection.kind === 'item' ? selection.id : undefined}
      close={() => setLayoutsOpen(false)} openLayout={openLayout} error={notice}
      duplicate={() => {
        const copy = duplicateLayout(activeProject.current)
        if (copy) apply(copy)
      }}
      rename={(id, name) => {
        const next = renameLayout(activeProject.current, id, name)
        if (next !== activeProject.current) apply(next)
      }}
      render={pair => { setLayoutsOpen(false); setOpenGallery(false); setRenderPair(pair); setRenderDesign(undefined); setStudio('open') }} /></Suspense>}
    {designsOpen && <Suspense fallback={null}><DesignDialog project={project} close={() => setDesignsOpen(false)} error={notice}
      select={id => updateDesign(current => selectDesign(current, id))}
      duplicate={() => updateDesign(current => {
        const names = new Set(current.designs?.entries.map(entry => entry.name))
        let number = 1
        while (names.has(`Tasarım ${number}`)) number++
        return duplicateDesign(current, activeDesign(current), `Tasarım ${number}`)
      })}
      rename={(id, name) => updateDesign(current => renameDesign(current, id, name))}
      remove={id => updateDesign(current => removeDesign(current, id))}
      render={design => { setDesignsOpen(false); setOpenGallery(false); setRenderPair(undefined); setRenderDesign(design); setStudio('open') }} /></Suspense>}
    {archiveOpen && <Suspense fallback={null}><ProjectArchiveDialog current={{ id: workspaceId, project }} canSaveCurrent={overwriteLocal.current}
      close={() => setArchiveOpen(false)} open={switchProject} imported={next => {
        switchEditor(next)
        void readPersonalModels().then(setPersonalModels).catch(() => setLibraryNotice('Kişisel katalog açılamadı.'))
      }} /></Suspense>}
    {deliveryOpen && <Suspense fallback={null}><DeliveryPackageDialog source={{ id: workspaceId, project }}
      close={() => setDeliveryOpen(false)} /></Suspense>}
    {review && <Suspense fallback={null}><MountingReviewDialog project={project} open={review === 'open'}
      close={() => setReview(undefined)} locate={locateReview} exportPlan={variant => {
        setReview('editing')
        setInstallation({ variant, fromReview: true })
      }} /></Suspense>}
    {installation && <Suspense fallback={null}><InstallationDialog project={project} initialVariant={installation.variant}
      personal close={() => {
        if (installation.fromReview) setReview('open')
        setInstallation(undefined)
      }} /></Suspense>}
    {transport && transportItem && <Suspense fallback={null}><TransportPathDialog project={project} item={transportItem}
      initialOrientation={transport.orientation} close={closeTransport} save={routePath => {
        const current = activeProject.current
        const items = current.items.map(item => item.id === transport.id
          ? { ...item, assembly: { allowance: 0, ...item.assembly, routePath } } : item)
        if (apply({ ...current, items })) closeTransport()
      }} /></Suspense>}
    {upperRow && <Suspense fallback={null}><UpperRowDialog project={project} edit={upperRow} close={() => setUpperRow(undefined)}
      apply={(next, ids) => {
        if (!apply(next, true)) return false
        setSelection(itemSelection(ids))
        setUpperRow(undefined)
        return true
      }} /></Suspense>}
    {wardrobeRun && <Suspense fallback={null}><WardrobeRunDialog project={project} wallId={wardrobeRun.wallId} runId={wardrobeRun.id} widthEdit={wardrobeRun.widthEdit} templatesEnabled
      apply={(next, items, previewed) => {
        if (!apply(next, previewed)) return false
        setSelection(itemSelection(items.map(item => item.id)))
        setWardrobeRun(undefined)
        return true
      }} close={() => setWardrobeRun(undefined)} /></Suspense>}
    {bedroomOpen && project.items.some(item => item.kind === 'bed') && <Suspense fallback={null}>
      <BedroomSystemDialog project={project} selectedId={selection.kind === 'item' ? selection.id : undefined}
        close={() => setBedroomOpen(false)} apply={(preview, preset, alternate) => {
          if (preview.errors.length || activeProject.current !== project) return
          const next = alternate ? saveBedroomAlternative(project, preview, preset) : preview.project
          if (!next || !commitProject(next)) return
          setBedroomOpen(false)
          setItemFocus(undefined)
          setOnlySelected(false)
          setSelection({ kind: 'item', id: preview.items[0].id })
          setNotice(alternate ? `${layoutName(next)} yerleşimi oluşturuldu.` : 'Yatak başı sistemi yerleşime eklendi.')
        }} />
    </Suspense>}
    {usageOpen && <Suspense fallback={null}><UsageScenarioDialog project={project} close={() => setUsageOpen(false)}
      save={scenario => {
        const current = activeProject.current
        const entries = current.usageScenarios ?? []
        const usageScenarios = entries.some(entry => entry.id === scenario.id)
          ? entries.map(entry => entry.id === scenario.id ? scenario : entry) : [...entries, scenario]
        return commitProject({ ...current, usageScenarios })
      }}
      remove={id => {
        const current = activeProject.current
        return commitProject({ ...current, usageScenarios: current.usageScenarios?.filter(entry => entry.id !== id) })
      }} /></Suspense>}
    {studio && <Suspense fallback={null}><RenderStudio open={studio === 'open'} close={() => setStudio('closed')}
      project={project} projectId={workspaceId} preferredPair={renderPair} preferredDesign={renderDesign} openGallery={openGallery}
      onSave={(settings, designId) => apply(saveDesignPresentation(activeProject.current, designId, settings))}
      saveScenes={renderScenes => apply({ ...activeProject.current, renderScenes })}
      openSnapshot={async (snapshot, job) => {
        const camera = snapshot.camera ?? job.metadata?.camera
        const cameraViews = camera && !snapshot.cameraViews?.some(view => sameCamera(view.camera, camera))
          ? [...(snapshot.cameraViews ?? []).slice(0, 11), { id: uid(), name: job.metadata?.cameraLabel ?? 'Render kamerası', camera }]
          : snapshot.cameraViews
        await switchProject(newArchiveProject(`Render kopyası · ${job.name}`, { ...snapshot, camera, cameraViews }))
      }}
      /></Suspense>}
    {help && <Suspense fallback={null}><HelpDialog initialTopic={help} personal close={() => setHelp(undefined)} /></Suspense>}
  </main>
}
