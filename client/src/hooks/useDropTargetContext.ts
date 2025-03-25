// Drop-target that can have its behavior modified by distant components, circumventing prop drilling.
// this is in contrast with useDropTarget, which needs to have all the props passed to it and locally available.
export { useDropTargetContext } from '../components/DropTargetContext/DropTargetContext.js';