import { App, Notice, Plugin, PluginSettingTab, Setting, MarkdownView, Editor, MarkdownFileInfo } from 'obsidian';
import * as https from 'https';

// 插件设置接口
interface MyPluginSettings {
    apiEndpoint: string;
    apiToken: string;
}

// 默认设置
const DEFAULT_SETTINGS: MyPluginSettings = {
    apiEndpoint: 'https://xxxxx/api/1/upload',
    apiToken: 'your-api-token-here'
};

// 提示错误的工具函数
function showError(message: string, error: Error | string) {
    console.error(message, error);
    new Notice(message);
}

// 图片上传服务类
class ImageUploadService {
    private apiEndpoint: string;
    private apiToken: string;

    constructor(apiEndpoint: string, apiToken: string) {
        this.apiEndpoint = apiEndpoint;
        this.apiToken = apiToken;
    }

    // 上传图片
    async uploadImage(blob: File): Promise<string | Error> {
        console.log('Uploading image...');
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    
        const payload = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="source"; filename="${blob.name}"\r\nContent-Type: ${blob.type}\r\n\r\n`),
            buffer,
            Buffer.from(`\r\n--${boundary}--\r\n`)
        ]);
    
        const url = new URL(this.apiEndpoint);
        const options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': payload.length,
                'X-API-Key': this.apiToken
            }
        };

        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let responseData = '';
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
    
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const json = JSON.parse(responseData);
                            if (json.status_code == 200) {
                                resolve(json.image.url);  // 返回图片 URL
                            } else {
                                reject(new Error('Upload failed: ' + responseData));
                            }
                        } catch (error) {
                            reject(new Error('Error parsing response: ' + error));
                        }
                    } else {
                        reject(new Error('Upload failed with status: ' + res.statusCode));
                    }
                });
            });
    
            req.on('error', (error) => {
                reject(new Error('Request error: ' + error));
            });
    
            req.write(payload);
            req.end();
        });
    }
}

// 插件主类
export default class PasteUploadPlugin extends Plugin {
    settings: MyPluginSettings;
    private imageUploadService: ImageUploadService;

    async onload(): Promise<void> {
        console.log('[info] Image upload plugin is loaded');
        
        // 加载插件设置
        await this.loadSettings();

        // 初始化图片上传服务
        this.imageUploadService = new ImageUploadService(this.settings.apiEndpoint, this.settings.apiToken);

        // 注册事件：监听粘贴
        this.registerEvent(this.app.workspace.on('editor-paste', this.paste_handle.bind(this)));
        
        // 为插件添加设置界面
        this.addSettingTab(new MyPluginSettingTab(this.app, this));
    }

    async loadSettings(): Promise<void> {
        const loadedSettings = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedSettings);
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    // 粘贴处理函数
    async paste_handle(evt: ClipboardEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) {
        const data = evt.clipboardData;
        if (data) {
            const items = data.items;
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type.startsWith('image')) {
                    evt.preventDefault();
                    const image_url = await this.imageUploadService.uploadImage(item.getAsFile() as File);
                    if (image_url instanceof Error) {
                        showError('Failed to upload image', image_url);
                    } else {
                        this.insert_image(image_url);
                    }
                }
            }
        }
    }

    // 插入图片
    insert_image(image_url: string) {
        const activeLeaf = this.app.workspace.activeLeaf;
        if (activeLeaf && activeLeaf.view instanceof MarkdownView) {
            const editor = activeLeaf.view.editor;
            const cursor = editor.getCursor();
            const imageMarkdown = `![](${image_url})`;
            editor.replaceRange(imageMarkdown, cursor);
        } else {
            showError('Failed to insert image, no active Markdown view.', 'No active Markdown view found');
        }
    }
}

// 设置选项卡类
class MyPluginSettingTab extends PluginSettingTab {
    plugin: PasteUploadPlugin;

    constructor(app: App, plugin: PasteUploadPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('API Endpoint')
            .setDesc('Enter the API endpoint URL')
            .addText(text => text
                .setPlaceholder('e.g., https://example.com/api/upload')
                .setValue(this.plugin.settings.apiEndpoint)
                .onChange(async (value) => {
                    this.plugin.settings.apiEndpoint = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('API Key')
            .setDesc('Enter your API key')
            .addText(text => text
                .setPlaceholder('e.g., 12345abcdef')
                .setValue(this.plugin.settings.apiToken)
                .onChange(async (value) => {
                    this.plugin.settings.apiToken = value;
                    await this.plugin.saveSettings();
                }));
    }
}
