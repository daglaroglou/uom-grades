// Apply release signing when keystore.properties exists (CI)
val keystorePropertiesFile = rootProject.file("keystore.properties")
if (keystorePropertiesFile.exists()) {
    val keystoreProperties = java.util.Properties()
    keystoreProperties.load(java.io.FileInputStream(keystorePropertiesFile))
    val android = extensions.getByType(com.android.build.gradle.internal.dsl.BaseAppModuleExtension::class.java)
    val configName = "uomRelease"
    if (android.signingConfigs.findByName(configName) == null) {
        android.signingConfigs.create(configName) {
            keyAlias = keystoreProperties["keyAlias"] as String
            keyPassword = keystoreProperties["password"] as String
            storeFile = file(keystoreProperties["storeFile"] as String)
            storePassword = keystoreProperties["password"] as String
        }
    }
    android.buildTypes.getByName("release").signingConfig = android.signingConfigs.getByName(configName)
}
