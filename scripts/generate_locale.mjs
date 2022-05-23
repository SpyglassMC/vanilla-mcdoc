import globby from 'globby'
import * as core from '@spyglassmc/core'
import * as mcdoc from '@spyglassmc/mcdoc'
import { pathToFileURL } from 'url'
import { dirname } from 'path'
import { writeFile, mkdir } from 'fs/promises'

const PROJECT = new core.Project({ cacheRoot: '.cache', projectPath: '.' })
mcdoc.initialize(PROJECT)

await PROJECT.init()

const KEYS = new Map()
const DOCS = new Map()

for (const path of await globby('**/*.mcdoc')) {
	const id = path.replaceAll('/', '::').replace(/(::mod)?\.mcdoc$/, '')
	const uri = pathToFileURL(path).toString()
	const result = await PROJECT.ensureParsedAndChecked(uri)

	try {
		if (!result?.node) {
			throw new Error('Could not parse module')
		}
		if (result.node.parserErrors.length > 0) {
			throw new Error(result.node.parserErrors[0].message)
		}
		processModule(result.doc, id, result.node.children[0])
	} catch (e) {
		console.warn(`Error processing module ${id}: ${e.message}`)
		throw e
	}
}

await PROJECT.close()

/**
 * @param {string} path
 * @param {Map<string, string>} map 
 */
async function writeMap(path, map) {
	const entries = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'en'))
	const contents = JSON.stringify(Object.fromEntries(entries), null, '\t')
	await mkdir(dirname(path), { recursive: true })
	await writeFile(path, contents + '\n')
} 

await Promise.all([
	writeMap('./locales/keys/en.json', KEYS),
	writeMap('./locales/docs/en.json', DOCS),
])

function getLine(doc, node) {
	return doc.positionAt(node.range.start).line + 1
}

function processModule(doc, prefix, node) {
	if (!mcdoc.ModuleNode.is(node)) {
		throw new Error(`Expected an mcdoc node, got ${node.type}`)
	}
	for (const child of node.children) {
		processChild(doc, prefix, child, false)
	}
}

function processChild(doc, prefix, node, named) {
	const id = node.children?.find(mcdoc.IdentifierNode.is)?.value
	const childKey = id === undefined ? prefix : `${prefix}::${id}`
	if (mcdoc.StructNode.is(node)) {
		if (!named && id === undefined) {
			console.warn(`Anonymous struct in ${prefix} on line ${getLine(doc, node)}`)
			return
		}
		if (id !== undefined) {
			KEYS.set(childKey, transformKey(id))
		}
		processStruct(childKey, node)
	} else if (mcdoc.EnumNode.is(node)) {
		if (!named && id === undefined) {
			console.warn(`Anonymous enum in ${prefix} on line ${getLine(doc, node)}`)
			return
		}
		if (id !== undefined) {
			KEYS.set(childKey, transformKey(id))
		}
		processEnum(childKey, node)
	} else if (mcdoc.DispatchStatementNode.is(node)) {
		const structBody = node.children.find(mcdoc.StructNode.is)
		if (structBody) {
			processChild(doc, childKey, structBody)
		}
	} else if (mcdoc.TypeAliasNode.is(node)) {
		const union = node.children.find(mcdoc.UnionTypeNode.is)
		if (id !== undefined) {
			KEYS.set(childKey, transformKey(id))
		}
		if (union) {
			for (const child of union.children) {
				if (mcdoc.TypeNode.is(child)) {
					processChild(doc, childKey, child, named || id !== undefined)
				}
			}
		}
	}
}

function processStruct(prefix, node) {
	if (!mcdoc.StructNode.is(node)) return
	processDocs(prefix, node)
	const block = node.children.find(mcdoc.StructBlockNode.is)
	const fields = block.children.filter(mcdoc.StructPairFieldNode.is)
	for (const field of fields) {
		const idKey = field.children.find(mcdoc.IdentifierNode.is)
		const mapKey = field.children.find(mcdoc.StructMapKeyNode.is)
		const nested = field.children.find(n => n.type === 'mcdoc:struct')
		if (idKey) {
			const fieldKey = `${prefix}.${idKey.value}`
			KEYS.set(fieldKey, transformKey(idKey.value))
			processDocs(fieldKey, field)
			processStruct(fieldKey, nested)
		} else if (mapKey && nested) {
			const pathKey = mapKey.children.find(n => n.type === 'mcdoc:type/path')
				?.children.find(mcdoc.PathNode.is)
				?.children.find(mcdoc.IdentifierNode.is)
			const fieldKey = pathKey ? `${prefix}.[${pathKey.value}]` : `${prefix}.*`
			processDocs(fieldKey, field)
			processStruct(fieldKey, nested)
		} else if (nested) {
			console.warn(`Unhandled field in ${prefix}: [${field.children.map(n => n.type).join(', ')}]`)
		}
	}
}

function processEnum(prefix, node) {
	if (!mcdoc.EnumNode.is(node)) return
	processDocs(prefix, node)
	const block = node.children.find(mcdoc.EnumBlockNode.is)
	const fields = block.children.filter(mcdoc.EnumFieldNode.is)
	for (const field of fields) {
		const idKey = field.children.find(mcdoc.IdentifierNode.is)
		if (idKey) {
			const enumKey = `${prefix}.${idKey.value}`
			KEYS.set(enumKey, transformKey(idKey.value))
			processDocs(enumKey, field)
		} else {
			console.warn(`Unhandled field in ${prefix}: [${field.children.map(n => n.type).join(', ')}]`)
		}
	}
}

function processDocs(key, node) {
	const doc = node.children.find(mcdoc.DocCommentsNode.is)
	if (doc) {
		const text = doc.children.filter(core.CommentNode.is)
			.map(n => n.comment.trim())
			.filter(s => s.length > 0)
			.join('\\n')
		DOCS.set(key, text)
	}
}

/**
 * @param {string} key 
 */
function transformKey(key) {
	const transformed = key
		.replace(/[a-z][A-Z]/g, s => s.charAt(0) + '_' + s.charAt(1))
		.replace(/_[A-Za-z]/g, s => ' ' + s.charAt(1))
		.replace(/ [A-Z][a-z]/g, s => s.toLowerCase())
	return transformed.charAt(0).toUpperCase() + transformed.substring(1)
}
